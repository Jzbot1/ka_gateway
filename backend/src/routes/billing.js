const express = require('express');
const axios = require('axios');
const prisma = require('../services/db');
const { authenticate, requireRole } = require('../middlewares/auth');
const socketService = require('../services/socket');
const webhookService = require('../services/webhook');

const router = express.Router();

// List plans available
router.get('/plans', async (req, res) => {
  try {
    const plans = await prisma.plan.findMany();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve pricing plans' });
  }
});

// Get Workspace subscription and financial context details
router.get('/subscription', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context missing' });

  try {
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    });

    // Fetch owner wallet details
    const ownerMember = await prisma.teamMember.findFirst({
      where: { workspaceId, role: 'OWNER' }
    });

    let walletBalance = 0.0;
    let transactions = [];

    if (ownerMember) {
      const owner = await prisma.user.findUnique({
        where: { id: ownerMember.userId },
        include: {
          walletTransactions: {
            orderBy: { createdAt: 'desc' },
            take: 20
          }
        }
      });
      if (owner) {
        walletBalance = owner.walletBalance;
        transactions = owner.walletTransactions;
      }
    }

    // Count monthly sent messages
    const usageCount = await prisma.message.count({
      where: {
        workspaceId,
        createdAt: { gte: sub ? sub.updatedAt : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        status: { in: ['SENT', 'DELIVERED', 'READ'] }
      }
    });

    res.json({
      subscription: sub,
      walletBalance,
      transactions,
      monthlyUsage: usageCount
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve subscription details' });
  }
});

// Update Subscription (Checkout flow simulation)
router.post('/checkout', authenticate, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  const workspaceId = req.workspaceId;
  const { planName } = req.body;

  if (!planName) return res.status(400).json({ error: 'Target plan name is required' });

  try {
    const plan = await prisma.plan.findUnique({ where: { name: planName } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const nextPeriod = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days validity

    const subscription = await prisma.subscription.upsert({
      where: { workspaceId },
      update: {
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: nextPeriod,
      },
      create: {
        workspaceId,
        planId: plan.id,
        status: 'ACTIVE',
        currentPeriodEnd: nextPeriod,
      },
      include: { plan: true },
    });

    res.json({
      success: true,
      message: `Successfully upgraded to ${plan.name} plan!`,
      subscription,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to process checkout transaction' });
  }
});

// -------------------------------------------------------------
// PAYTM UPI QR GATEWAY ROUTING
// -------------------------------------------------------------

const STORE_NAME = process.env.STORE_NAME || 'JZ Gateway';

// Handler for initiating checkout/recharge
async function initiatePayment(req, res) {
  const workspaceId = req.workspaceId;
  const { planName, amount } = req.body;

  if (!planName) return res.status(400).json({ error: 'Plan name is required to pay' });

  try {
    const plan = await prisma.plan.findUnique({ where: { name: planName } });
    if (!plan) return res.status(404).json({ error: 'Selected subscription plan not found' });

    let finalAmount = plan.price;
    let orderId = `JZTXN_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    if (amount !== undefined) {
      const parsedAmt = parseFloat(amount);
      if (isNaN(parsedAmt) || parsedAmt <= 0) {
        return res.status(400).json({ error: 'Invalid recharge amount.' });
      }
      finalAmount = parsedAmt;
      orderId = `WLT_RECHG_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const CASH_FREE_TOKEN = process.env.CASH_FREE_TOKEN;
    const CASH_FREE_CREATE_ORDER_URL = process.env.CASH_FREE_CREATE_ORDER_URL;

    // Create payment entry in PENDING status
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: finalAmount,
        planName: plan.name,
        workspaceId,
        status: 'PENDING',
      },
    });

    let paymentUrl = '';

    if (CASH_FREE_TOKEN && CASH_FREE_CREATE_ORDER_URL) {
      try {
        const origin = req.headers.origin || req.headers.referer;
        let frontendBaseUrl = 'http://localhost:5173';
        if (origin) {
          try {
            const parsedUrl = new URL(origin);
            frontendBaseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
          } catch (e) {
            // ignore parse errors
          }
        }
        const redirectUrl = `${frontendBaseUrl}/billing`;
        const params = new URLSearchParams();
        params.append('customer_mobile', '9999999999'); // Fallback mock mobile
        params.append('user_token', CASH_FREE_TOKEN);
        params.append('amount', finalAmount.toString());
        params.append('order_id', orderId);
        params.append('redirect_url', redirectUrl);
        params.append('remark1', workspaceId);
        params.append('remark2', planName);

        const gatewayRes = await axios.post(CASH_FREE_CREATE_ORDER_URL, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        });

        if (gatewayRes.data && gatewayRes.data.status === true && gatewayRes.data.result) {
          paymentUrl = gatewayRes.data.result.payment_url;
          // Update payment record with payment url
          await prisma.payment.update({
            where: { orderId },
            data: { paymentUrl }
          });
        } else {
          console.error('[Gateway create-order failed]:', gatewayRes.data);
        }
      } catch (err) {
        console.error('[Gateway connection error]:', err.message);
      }
    }

    res.json({
      success: true,
      orderId,
      amount: finalAmount,
      paymentUrl,
      storeName: STORE_NAME,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to initiate checkout payment' });
  }
}

// Rate limiting in-memory storage for status checking
const lastChecks = new Map();

// Handler for checking transaction status
async function checkPaymentStatus(req, res) {
  const { orderId, simulateSuccess } = req.body;

  if (!orderId) return res.status(400).json({ error: 'Order ID is required' });

  // Rate Limiting: 1 check per 2 seconds
  const now = Date.now();
  const lastCheck = lastChecks.get(orderId) || 0;
  if (now - lastCheck < 2000) {
    return res.json({ status: 'PENDING', message: 'Checking too fast. Please wait.' });
  }
  lastChecks.set(orderId, now);

  try {
    const payment = await prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) return res.status(404).json({ error: 'Payment transaction session not found' });

    // Security: Validate workspace ownership to prevent IDOR spoofing
    if (payment.workspaceId !== req.workspaceId) {
      return res.status(403).json({ error: 'Access denied: Payment workspace context mismatch.' });
    }

    if (payment.status === 'SUCCESS') {
      return res.json({ status: 'SUCCESS', message: 'Payment completed successfully.' });
    }

    // A. Simulator Check (for developer reviews and local testing)
    if (simulateSuccess === true || orderId.includes('_MOCK_')) {
      const utr = `UTR${Math.floor(100000000000 + Math.random() * 900000000000)}`;
      await finalizeSuccessfulPayment(payment, utr);
      return res.json({ status: 'SUCCESS', message: 'Simulated payment success.' });
    }

    // B. Real Gateway Check Status Call
    const CASH_FREE_TOKEN = process.env.CASH_FREE_TOKEN;
    const CASH_FREE_CHECK_STATUS_URL = process.env.CASH_FREE_CHECK_STATUS_URL;

    if (CASH_FREE_TOKEN && CASH_FREE_CHECK_STATUS_URL) {
      try {
        const params = new URLSearchParams();
        params.append('user_token', CASH_FREE_TOKEN);
        params.append('order_id', orderId);

        const response = await axios.post(CASH_FREE_CHECK_STATUS_URL, params, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        });

        const result = response.data;
        if (
          result &&
          (result.status === 'FAILED' || 
           (result.result && (result.result.status === 'FAILED' || result.result.txnStatus === 'FAILED')))
        ) {
          await prisma.payment.update({
            where: { orderId },
            data: { status: 'FAILED' }
          });
          return res.json({ status: 'FAILED', message: result.message || 'Payment failed on the gateway.' });
        }

        if (
          result &&
          result.status === 'COMPLETED' &&
          result.result &&
          result.result.status === 'SUCCESS'
        ) {
          const utr = result.result.utr || `UTR${Math.floor(100000000000 + Math.random() * 900000000000)}`;

          // Prevent double spend by checking unique UTR reference
          const existing = await prisma.payment.findFirst({
            where: { utr, status: 'SUCCESS' },
          });

          if (existing) {
            return res.json({ status: 'PENDING', message: 'Duplicate transaction reference code' });
          }

          // Complete the payment, update plan, and notify systems
          await finalizeSuccessfulPayment(payment, utr);

          return res.json({ status: 'SUCCESS', message: 'Payment successfully processed!' });
        }
      } catch (apiError) {
        console.warn('[Gateway Status API Connection Timeout / Issue]:', apiError.message);
      }
    }

    res.json({ status: 'PENDING' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal status checking logic error' });
  }
}

// Map endpoints
router.post('/payment/initiate', authenticate, requireRole(['OWNER', 'ADMIN']), initiatePayment);
router.post('/payment/status', authenticate, checkPaymentStatus);

router.post('/paytm/initiate', authenticate, requireRole(['OWNER', 'ADMIN']), initiatePayment);
router.post('/paytm/status', authenticate, checkPaymentStatus);


// Helper to finalize successful payment details
async function finalizeSuccessfulPayment(payment, utr) {
  const plan = await prisma.plan.findUnique({ where: { name: payment.planName } });
  if (!plan) throw new Error('Target plan missing');

  // Start Transaction updates
  await prisma.$transaction(async (tx) => {
    // Security: Re-verify payment state inside transaction to prevent double spending race conditions
    const currentPayment = await tx.payment.findUnique({
      where: { id: payment.id },
    });

    if (currentPayment && currentPayment.status === 'SUCCESS') {
      throw new Error('Payment already finalized in concurrent database session.');
    }

    // 1. Mark payment SUCCESS
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCESS', utr },
    });

    if (payment.orderId.startsWith('WLT_RECHG_')) {
      // Wallet Recharge Flow
      const ownerMember = await tx.teamMember.findFirst({
        where: { workspaceId: payment.workspaceId, role: 'OWNER' }
      });
      if (!ownerMember) throw new Error('Workspace owner not found for recharge');

      const owner = await tx.user.findUnique({ where: { id: ownerMember.userId } });
      if (!owner) throw new Error('Owner account not found');

      await tx.user.update({
        where: { id: owner.id },
        data: { walletBalance: owner.walletBalance + payment.amount }
      });

      await tx.walletTransaction.create({
        data: {
          userId: owner.id,
          amount: payment.amount,
          type: 'RECHARGE',
          description: `Simulated Wallet Top-up (Order: ${payment.orderId})`
        }
      });
    } else {
      // Subscription Plan Upgrade Flow
      const nextPeriod = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days extension
      await tx.subscription.upsert({
        where: { workspaceId: payment.workspaceId },
        update: {
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodEnd: nextPeriod,
          freeMessagesRemaining: plan.name === 'Free' ? 5 : plan.freeMessages,
        },
        create: {
          workspaceId: payment.workspaceId,
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodEnd: nextPeriod,
          freeMessagesRemaining: plan.name === 'Free' ? 5 : plan.freeMessages,
        },
      });
    }
  });

  // 3. Dispatch Socket.IO update notifications
  socketService.notifyWorkspace(payment.workspaceId, 'payment.success', {
    orderId: payment.orderId,
    planName: payment.planName,
    amount: payment.amount,
    utr,
  });

  // 4. Dispatch webhook
  webhookService.triggerWebhook(payment.workspaceId, 'payment.success', {
    orderId: payment.orderId,
    planName: payment.planName,
    amount: payment.amount,
    utr,
  });

  // 5. Telegram Notification
  const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (telegramBotToken && telegramChatId) {
    const textMsg = `🔔 *New JZGateway Purchase Notification*\n\n` +
      `🆔 *Order ID:* \`${payment.orderId}\`\n` +
      `📦 *Plan Upgraded:* \`${payment.planName}\`\n` +
      `💰 *Amount:* ₹${payment.amount.toFixed(2)}\n` +
      `✨ *UTR Reference:* \`${utr}\`\n` +
      `📅 *Date:* ${new Date().toLocaleString()}`;

    axios.post(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      chat_id: telegramChatId,
      text: textMsg,
      parse_mode: 'Markdown',
    }).catch((err) => {
      console.error('Telegram payment notify failed:', err.message);
    });
  }
}

// Handler to retrieve detailed payment session for checkout routing
async function getPaymentDetails(req, res) {
  const { orderId } = req.params;
  try {
    const payment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment transaction session not found' });
    }

    // Security ownership validation: Verify user belongs to the payment's workspace
    const membership = await prisma.teamMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: payment.workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied: You are not a member of the workspace associated with this payment.' });
    }

    res.json({
      ...payment,
      storeName: STORE_NAME,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to retrieve payment session context' });
  }
}

// Handler to explicitly cancel/expire transaction session
async function cancelPayment(req, res) {
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: 'Order ID is required to cancel' });

  try {
    const payment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (!payment) return res.status(404).json({ error: 'Payment session not found' });

    // Security check: Verify user belongs to the payment's workspace
    const membership = await prisma.teamMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user.id,
          workspaceId: payment.workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (payment.status !== 'PENDING') {
      return res.status(400).json({ error: `Cannot cancel a transaction in ${payment.status} status` });
    }

    const updated = await prisma.payment.update({
      where: { orderId },
      data: { status: 'FAILED' }
    });

    res.json({ success: true, status: updated.status });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to cancel payment session' });
  }
}

// Map endpoints
router.get('/payment/payment/:orderId', authenticate, getPaymentDetails);
router.post('/payment/cancel', authenticate, cancelPayment);

router.get('/paytm/payment/:orderId', authenticate, getPaymentDetails);
router.post('/paytm/cancel', authenticate, cancelPayment);

module.exports = router;
