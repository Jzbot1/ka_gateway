const express = require('express');
const prisma = require('../services/db');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// Middleware to ensure user is admin
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'ADMIN') {
    return next();
  }
  return res.status(403).json({ error: 'Super Admin access level required' });
}

// Get Admin System-Wide Dashboard Stats (Financial & Usage)
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalWorkspaces = await prisma.workspace.count();
    const totalGateways = await prisma.gateway.count();
    const activeGateways = await prisma.gateway.count({ where: { status: 'CONNECTED' } });
    
    const totalMessages = await prisma.message.count();
    const sentMessages = await prisma.message.count({ where: { status: 'SENT' } });
    const deliveredMessages = await prisma.message.count({ where: { status: 'DELIVERED' } });
    const readMessages = await prisma.message.count({ where: { status: 'READ' } });
    const failedMessages = await prisma.message.count({ where: { status: 'FAILED' } });

    // Financial calculations
    const rechargesSum = await prisma.walletTransaction.aggregate({
      where: { type: 'RECHARGE' },
      _sum: { amount: true }
    });
    const deductionsSum = await prisma.walletTransaction.aggregate({
      where: { type: 'DEDUCTION' },
      _sum: { amount: true }
    });

    const totalRevenue = rechargesSum._sum.amount || 0;
    const totalSpent = Math.abs(deductionsSum._sum.amount || 0);

    const serverHealth = {
      cpu: '14%',
      memory: '39%',
      redis: 'Connected',
      uptime: '15d 12h',
    };

    res.json({
      metrics: {
        totalUsers,
        totalWorkspaces,
        totalGateways,
        activeGateways,
        totalMessages,
        deliveryRate: totalMessages > 0 ? (((sentMessages + deliveredMessages + readMessages) / totalMessages) * 100).toFixed(1) + '%' : '100%',
        failedMessages,
        totalRevenue,
        totalSpent,
      },
      serverHealth,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve admin stats' });
  }
});

// List Users with Workspace and Subscription details
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        walletBalance: true,
        createdAt: true,
        workspaces: {
          include: {
            workspace: {
              include: {
                subscription: {
                  include: {
                    plan: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});

// Update user workspace subscription manually by admin
router.put('/user-subscription', authenticate, requireAdmin, async (req, res) => {
  const { userId, planName } = req.body;

  if (!userId || !planName) {
    return res.status(400).json({ error: 'User ID and target Plan Name are required' });
  }

  try {
    const userWorkspace = await prisma.teamMember.findFirst({
      where: { userId, role: 'OWNER' },
    });

    if (!userWorkspace) {
      return res.status(404).json({ error: 'Primary workspace not found for this user' });
    }

    const plan = await prisma.plan.findUnique({ where: { name: planName } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const nextPeriod = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days extension

    const subscription = await prisma.subscription.upsert({
      where: { workspaceId: userWorkspace.workspaceId },
      update: {
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: nextPeriod,
        freeMessagesRemaining: plan.name === 'Free' ? 5 : plan.freeMessages,
      },
      create: {
        workspaceId: userWorkspace.workspaceId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: nextPeriod,
        freeMessagesRemaining: plan.name === 'Free' ? 5 : plan.freeMessages,
      },
      include: { plan: true },
    });

    res.json({
      success: true,
      message: `Successfully upgraded user's workspace to ${plan.name} plan!`,
      subscription,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update user subscription plan' });
  }
});

// Admin Pricing Rules endpoints
router.get('/pricing', authenticate, requireAdmin, async (req, res) => {
  try {
    const rules = await prisma.pricingRule.findMany();
    res.json(rules);
  } catch (e) {
    res.status(500).json({ error: 'Failed to retrieve pricing settings' });
  }
});

router.put('/pricing', authenticate, requireAdmin, async (req, res) => {
  const { provider, messageType, price } = req.body;
  if (!provider || !messageType || price === undefined) {
    return res.status(400).json({ error: 'Provider, messageType, and price are required' });
  }

  try {
    const rule = await prisma.pricingRule.upsert({
      where: {
        provider_messageType: {
          provider: provider.toUpperCase(),
          messageType: messageType.toUpperCase(),
        }
      },
      update: { price: parseFloat(price) },
      create: {
        provider: provider.toUpperCase(),
        messageType: messageType.toUpperCase(),
        price: parseFloat(price)
      }
    });
    res.json(rule);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update pricing rules' });
  }
});

// Admin manual balance adjustments
router.post('/wallet/adjust', authenticate, requireAdmin, async (req, res) => {
  const { userId, amount, description } = req.body;
  if (!userId || amount === undefined) {
    return res.status(400).json({ error: 'User ID and adjustment amount are required' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const targetVal = parseFloat(amount);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { walletBalance: user.walletBalance + targetVal },
    });

    await prisma.walletTransaction.create({
      data: {
        userId,
        amount: targetVal,
        type: targetVal >= 0 ? 'RECHARGE' : 'DEDUCTION',
        description: description || 'Admin manual ledger adjustment',
      }
    });

    res.json({ success: true, balance: updated.walletBalance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to process balance adjustment' });
  }
});

// Admin wallet transaction history logs
router.get('/wallet/transactions', authenticate, requireAdmin, async (req, res) => {
  try {
    const list = await prisma.walletTransaction.findMany({
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to query transactions list' });
  }
});

// Subscription Plan CRUD endpoints
router.get('/plans', authenticate, requireAdmin, async (req, res) => {
  try {
    const list = await prisma.plan.findMany({
      orderBy: { displayOrder: 'asc' }
    });
    res.json(list);
  } catch (e) {
    res.status(500).json({ error: 'Failed to query plans list' });
  }
});

router.post('/plans', authenticate, requireAdmin, async (req, res) => {
  const {
    name, price, billingPeriod, description, features, badge,
    displayOrder, isActive, rateLimit, storageLimit, freeMessages,
    gatewayLimit, apiLimit, messagesLimit, teamLimit, webhooksLimit,
    brandingEnabled, priorityQueue
  } = req.body;

  if (!name || price === undefined) {
    return res.status(400).json({ error: 'Plan name and price are required' });
  }

  try {
    const plan = await prisma.plan.create({
      data: {
        name,
        price: parseFloat(price),
        billingPeriod: billingPeriod || 'MONTHLY',
        description,
        features: Array.isArray(features) ? features.join(',') : features,
        badge,
        displayOrder: parseInt(displayOrder) || 0,
        isActive: isActive !== false,
        rateLimit: parseInt(rateLimit) || 60,
        storageLimit: parseFloat(storageLimit) || 100.0,
        freeMessages: parseInt(freeMessages) || 0,
        gatewayLimit: parseInt(gatewayLimit) || 1,
        apiLimit: parseInt(apiLimit) || 1000,
        messagesLimit: parseInt(messagesLimit) || 5000,
        teamLimit: parseInt(teamLimit) || 2,
        webhooksLimit: parseInt(webhooksLimit) || 1,
        brandingEnabled: brandingEnabled === true,
        priorityQueue: priorityQueue === true
      }
    });
    res.json({ success: true, plan });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to create plan' });
  }
});

router.put('/plans/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    name, price, billingPeriod, description, features, badge,
    displayOrder, isActive, rateLimit, storageLimit, freeMessages,
    gatewayLimit, apiLimit, messagesLimit, teamLimit, webhooksLimit,
    brandingEnabled, priorityQueue
  } = req.body;

  try {
    const plan = await prisma.plan.update({
      where: { id },
      data: {
        name,
        price: price !== undefined ? parseFloat(price) : undefined,
        billingPeriod,
        description,
        features: Array.isArray(features) ? features.join(',') : features,
        badge,
        displayOrder: displayOrder !== undefined ? parseInt(displayOrder) : undefined,
        isActive,
        rateLimit: rateLimit !== undefined ? parseInt(rateLimit) : undefined,
        storageLimit: storageLimit !== undefined ? parseFloat(storageLimit) : undefined,
        freeMessages: freeMessages !== undefined ? parseInt(freeMessages) : undefined,
        gatewayLimit: gatewayLimit !== undefined ? parseInt(gatewayLimit) : undefined,
        apiLimit: apiLimit !== undefined ? parseInt(apiLimit) : undefined,
        messagesLimit: messagesLimit !== undefined ? parseInt(messagesLimit) : undefined,
        teamLimit: teamLimit !== undefined ? parseInt(teamLimit) : undefined,
        webhooksLimit: webhooksLimit !== undefined ? parseInt(webhooksLimit) : undefined,
        brandingEnabled,
        priorityQueue
      }
    });
    res.json({ success: true, plan });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to update plan properties' });
  }
});

router.delete('/plans/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.plan.delete({ where: { id } });
    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to delete target plan' });
  }
});

// Seed default plans helper (Updated with new schema fields)
router.post('/plans/seed', async (req, res) => {
  try {
    const plansData = [
      { name: 'Free', price: 0, description: 'Default Free tier validation options', features: '1 Linked Gateway,Basic API access,5 Lifetime free messages', badge: 'New', displayOrder: 1, isActive: true, rateLimit: 30, storageLimit: 20.0, freeMessages: 5, gatewayLimit: 1, messagesLimit: 5, apiLimit: 100, teamLimit: 0, webhooksLimit: 0, brandingEnabled: false, priorityQueue: false },
      { name: 'Starter', price: 19, description: 'Starter plan options for small businesses', features: '3 Linked Gateways,10,000 Monthly messages,Branding customization,Standard Queue', badge: 'Recommended', displayOrder: 2, isActive: true, rateLimit: 60, storageLimit: 100.0, freeMessages: 0, gatewayLimit: 3, messagesLimit: 10000, apiLimit: 5000, teamLimit: 3, webhooksLimit: 2, brandingEnabled: true, priorityQueue: false },
      { name: 'Business', price: 49, description: 'Premium options for growing teams', features: '10 Linked Gateways,50,000 Monthly messages,Priority Queue priority,5 Dedicated webhooks', badge: 'Popular', displayOrder: 3, isActive: true, rateLimit: 120, storageLimit: 500.0, freeMessages: 0, gatewayLimit: 10, messagesLimit: 50000, apiLimit: 25000, teamLimit: 10, webhooksLimit: 5, brandingEnabled: true, priorityQueue: true },
      { name: 'Enterprise', price: 149, description: 'Reseller dashboard console features', features: 'Unlimited linked channels,White-labeling settings,Reseller system access,Unrestricted logs', badge: 'New', displayOrder: 4, isActive: true, rateLimit: 300, storageLimit: 2000.0, freeMessages: 0, gatewayLimit: 99, messagesLimit: 999999, apiLimit: 999999, teamLimit: 99, webhooksLimit: 99, brandingEnabled: true, priorityQueue: true },
    ];

    for (const plan of plansData) {
      await prisma.plan.upsert({
        where: { name: plan.name },
        update: plan,
        create: plan,
      });
    }

    res.json({ success: true, message: 'Pricing plans seeded successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to seed plans' });
  }
});

module.exports = router;
