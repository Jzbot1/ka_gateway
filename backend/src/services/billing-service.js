const prisma = require('./db');

const DEFAULT_PRICES = {
  BAILEYS: {
    TEXT: 0.10,
    IMAGE: 0.15,
    VIDEO: 0.20,
    AUDIO: 0.15,
    DOCUMENT: 0.20,
    OTP: 0.12,
    INVOICE: 0.15,
    TEMPLATE: 0.10,
  },
  META: {
    TEXT: 0.20,
    IMAGE: 0.25,
    VIDEO: 0.30,
    AUDIO: 0.25,
    DOCUMENT: 0.30,
    OTP: 0.22,
    INVOICE: 0.25,
    TEMPLATE: 0.20,
  }
};

/**
 * Perform a dry-run check without updating database columns.
 */
async function checkMessageChargeDryRun(workspaceId, provider = 'BAILEYS', messageType = 'TEXT') {
  const provKey = provider.toUpperCase().includes('META') ? 'META' : 'BAILEYS';
  const typeKey = messageType.toUpperCase();

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });

  if (!sub) return { allowed: false, error: 'No active subscription context' };

  const ownerMember = await prisma.teamMember.findFirst({
    where: { workspaceId, role: 'OWNER' },
  });

  if (!ownerMember) return { allowed: false, error: 'Workspace owner membership context missing' };

  const owner = await prisma.user.findUnique({ where: { id: ownerMember.userId } });
  if (!owner) return { allowed: false, error: 'Workspace owner account not found' };

  if (sub.plan.name === 'Free') {
    if (sub.freeMessagesRemaining > 0) {
      return { allowed: true, chargedFrom: 'FREE_LIMIT' };
    }
  } else {
    // Count sent messages in current period
    const messagesCount = await prisma.message.count({
      where: {
        workspaceId,
        createdAt: { gte: sub.updatedAt },
        status: { in: ['SENT', 'DELIVERED', 'READ'] }
      }
    });

    if (messagesCount < sub.plan.messagesLimit) {
      return { allowed: true, chargedFrom: 'PLAN_ALLOWANCE' };
    }
  }

  // Check wallet balance
  const rule = await prisma.pricingRule.findUnique({
    where: { provider_messageType: { provider: provKey, messageType: typeKey } }
  });

  const price = rule ? rule.price : (DEFAULT_PRICES[provKey][typeKey] || 0.10);

  if (owner.walletBalance >= price) {
    return { allowed: true, chargedFrom: 'WALLET', price };
  }

  return { allowed: false, error: 'Insufficient Wallet Balance' };
}

/**
 * Checks if a workspace has enough credit/limit to send a message,
 * and deducts the charge (either from free quota or user wallet balance).
 */
async function checkAndDeductMessageCharge(workspaceId, provider = 'BAILEYS', messageType = 'TEXT') {
  const provKey = provider.toUpperCase().includes('META') ? 'META' : 'BAILEYS';
  const typeKey = messageType.toUpperCase();

  const sub = await prisma.subscription.findUnique({
    where: { workspaceId },
    include: { plan: true },
  });

  if (!sub) return { allowed: false, error: 'No active subscription context' };

  const ownerMember = await prisma.teamMember.findFirst({
    where: { workspaceId, role: 'OWNER' },
  });

  if (!ownerMember) return { allowed: false, error: 'Workspace owner membership context missing' };

  const owner = await prisma.user.findUnique({ where: { id: ownerMember.userId } });
  if (!owner) return { allowed: false, error: 'Workspace owner account not found' };

  if (sub.plan.name === 'Free') {
    if (sub.freeMessagesRemaining > 0) {
      await prisma.subscription.update({
        where: { workspaceId },
        data: { freeMessagesRemaining: sub.freeMessagesRemaining - 1 },
      });

      return {
        allowed: true,
        chargedFrom: 'FREE_LIMIT',
        remainingFree: sub.freeMessagesRemaining - 1,
        price: 0,
      };
    }
  } else {
    // Count sent messages in current period
    const messagesCount = await prisma.message.count({
      where: {
        workspaceId,
        createdAt: { gte: sub.updatedAt },
        status: { in: ['SENT', 'DELIVERED', 'READ'] }
      }
    });

    if (messagesCount < sub.plan.messagesLimit) {
      return {
        allowed: true,
        chargedFrom: 'PLAN_ALLOWANCE',
        price: 0,
      };
    }
  }

  // Deduct price from wallet balance
  const rule = await prisma.pricingRule.findUnique({
    where: { provider_messageType: { provider: provKey, messageType: typeKey } }
  });

  const price = rule ? rule.price : (DEFAULT_PRICES[provKey][typeKey] || 0.10);

  if (owner.walletBalance >= price) {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: owner.id },
        data: { walletBalance: owner.walletBalance - price },
      }),
      prisma.walletTransaction.create({
        data: {
          userId: owner.id,
          amount: -price,
          type: 'DEDUCTION',
          description: `WhatsApp Outbound Charge (${provKey} ${typeKey})`,
        }
      })
    ]);

    return {
      allowed: true,
      chargedFrom: 'WALLET',
      price,
      newBalance: owner.walletBalance - price,
    };
  }

  return {
    allowed: false,
    error: 'Insufficient Wallet Balance',
  };
}

module.exports = {
  checkMessageChargeDryRun,
  checkAndDeductMessageCharge,
  DEFAULT_PRICES,
};
