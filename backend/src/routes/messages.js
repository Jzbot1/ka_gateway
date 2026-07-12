const express = require('express');
const prisma = require('../services/db');
const { authenticate } = require('../middlewares/auth');
const queueService = require('../services/queue');
const pdfService = require('../services/pdf-invoice');

const router = express.Router();

// Get Message Logs
router.get('/logs', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context missing' });

  const { status, search } = req.query;

  try {
    const where = { workspaceId };
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { receiver: { contains: search } },
        { content: { contains: search } },
      ];
    }

    const messages = await prisma.message.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Helper: Apply Branding to Content
async function applyBranding(workspaceId, text) {
  const branding = await prisma.companyBranding.findUnique({
    where: { workspaceId },
  });

  if (!branding) return text;

  let brandedText = text;
  // If there's signature and it's not already in the text
  if (branding.signature && !brandedText.includes(branding.signature)) {
    brandedText = `${brandedText}\n\n${branding.signature}`;
  }
  // Add footer text if configured
  if (branding.footerText && !brandedText.includes(branding.footerText)) {
    brandedText = `${brandedText}\n\n_${branding.footerText}_`;
  }

  return brandedText;
}

function formatPhoneNumber(phone) {
  if (!phone) return '';
  // Remove all non-digit characters
  let clean = phone.toString().replace(/\D/g, '');
  
  // If it has a leading 0 followed by 10 digits, strip the 0
  if (clean.length === 11 && clean.startsWith('0')) {
    clean = clean.substring(1);
  }
  
  // If it is a 10-digit number, prepend 91 (India country code)
  if (clean.length === 10) {
    clean = '91' + clean;
  }
  
  return clean;
}

// Unified Send Message REST API
router.post('/send-message', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  const { gatewayId, to, message, type = 'TEXT', mediaUrl } = req.body;

  if (!to || (!message && type === 'TEXT')) {
    return res.status(400).json({ error: 'Recipient phone (to) and message content are required' });
  }

  try {
    // Determine gateway
    let targetGatewayId = gatewayId;
    if (!targetGatewayId) {
      // Pick first connected gateway
      const active = await prisma.gateway.findFirst({
        where: { workspaceId, status: 'CONNECTED' },
      });
      if (!active) {
        return res.status(400).json({ error: 'No active/connected gateway found in this workspace' });
      }
      targetGatewayId = active.id;
    }

    const gateway = await prisma.gateway.findUnique({ where: { id: targetGatewayId } });
    if (!gateway) return res.status(404).json({ error: 'Gateway not found' });

    // Dry-run billing check
    const billingService = require('../services/billing-service');
    const chargeCheck = await billingService.checkMessageChargeDryRun(workspaceId, gateway.provider, type);
    if (!chargeCheck.allowed) {
      return res.status(400).json({ error: chargeCheck.error });
    }

    // Apply company branding if text-based message
    let finalContent = message;
    if (type === 'TEXT') {
      finalContent = await applyBranding(workspaceId, message);
    }

    // Write message log to DB in PENDING status
    const msg = await prisma.message.create({
      data: {
        workspaceId,
        gatewayId: targetGatewayId,
        receiver: formatPhoneNumber(to),
        type,
        content: finalContent || '',
        mediaUrl,
        status: 'PENDING',
      },
    });

    // Enqueue message job
    await queueService.queueMessage(msg.id);

    res.status(202).json({
      message: 'Message queued successfully',
      messageId: msg.id,
      status: 'PENDING',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to queue message' });
  }
});

// Send OTP System
router.post('/send-otp', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  const { to, companyName, validityMinutes = 5 } = req.body;

  if (!to) return res.status(400).json({ error: 'Recipient phone (to) is required' });

  try {
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const finalCompany = companyName || 'jzgateway';
    const content = `Your OTP verification code for ${finalCompany} is ${otpCode}. It is valid for ${validityMinutes} minutes.`;

    const active = await prisma.gateway.findFirst({
      where: { workspaceId, status: 'CONNECTED' },
    });
    if (!active) return res.status(400).json({ error: 'No active gateway available' });

    // Dry-run billing check
    const billingService = require('../services/billing-service');
    const chargeCheck = await billingService.checkMessageChargeDryRun(workspaceId, active.provider, 'OTP');
    if (!chargeCheck.allowed) {
      return res.status(400).json({ error: chargeCheck.error });
    }

    const msg = await prisma.message.create({
      data: {
        workspaceId,
        gatewayId: active.id,
        receiver: formatPhoneNumber(to),
        type: 'OTP',
        content,
        status: 'PENDING',
      },
    });

    await queueService.queueMessage(msg.id);

    res.status(202).json({
      message: 'OTP queued successfully',
      messageId: msg.id,
      otp: otpCode, // return for application testing
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to trigger OTP message' });
  }
});

// Send PDF Invoice
router.post('/send-invoice', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  const { to, invoiceDetails } = req.body;

  if (!to || !invoiceDetails) {
    return res.status(400).json({ error: 'Recipient (to) and invoiceDetails are required' });
  }

  try {
    const branding = await prisma.companyBranding.findUnique({ where: { workspaceId } });
    
    // Inject branding details into PDF generator
    const pdfData = {
      ...invoiceDetails,
      company: {
        name: branding?.companyName || 'SaaS Workspace Client',
        phone: branding?.phone,
        email: branding?.email,
        address: branding?.address,
        signature: branding?.signature,
        footerText: branding?.footerText,
      },
    };

    // Compile pdf
    const pdfBuffer = await pdfService.generateInvoicePdf(pdfData);
    
    // In production, upload buffer to S3 / local disk.
    // For demo/testing, we simulate hosting on a local mock URL:
    const mockPdfUrl = `https://gateway.saas/invoices/INV-${Date.now().toString().slice(-6)}.pdf`;

    const active = await prisma.gateway.findFirst({
      where: { workspaceId, status: 'CONNECTED' },
    });
    if (!active) return res.status(400).json({ error: 'No active gateway available' });

    // Dry-run billing check
    const billingService = require('../services/billing-service');
    const chargeCheck = await billingService.checkMessageChargeDryRun(workspaceId, active.provider, 'INVOICE');
    if (!chargeCheck.allowed) {
      return res.status(400).json({ error: chargeCheck.error });
    }

    const msg = await prisma.message.create({
      data: {
        workspaceId,
        gatewayId: active.id,
        receiver: formatPhoneNumber(to),
        type: 'INVOICE',
        content: `Invoice ${invoiceDetails.invoiceNumber || ''} generated and attached.`,
        mediaUrl: mockPdfUrl,
        status: 'PENDING',
      },
    });

    await queueService.queueMessage(msg.id);

    res.status(202).json({
      message: 'Invoice PDF compiled and queued successfully',
      messageId: msg.id,
      invoiceUrl: mockPdfUrl,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to compile and queue invoice PDF' });
  }
});

// Create and start Campaign
router.post('/campaigns', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  const { name, receivers, message } = req.body; // receivers is array of phones

  if (!name || !receivers || !Array.isArray(receivers) || receivers.length === 0 || !message) {
    return res.status(400).json({ error: 'Campaign name, receiver list, and message are required' });
  }

  try {
    const formattedReceivers = receivers.map(phone => formatPhoneNumber(phone)).filter(p => p.length > 0);
    if (formattedReceivers.length === 0) {
      return res.status(400).json({ error: 'No valid recipient phone numbers provided' });
    }

    const active = await prisma.gateway.findFirst({
      where: { workspaceId, status: 'CONNECTED' },
    });
    if (!active) return res.status(400).json({ error: 'No active/connected gateway found in this workspace' });

    // Validate campaign cost against wallet/allowance
    const billingService = require('../services/billing-service');
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    });

    if (sub.plan.name === 'Free') {
      const availableFree = sub.freeMessagesRemaining;
      const needPaidCount = Math.max(0, formattedReceivers.length - availableFree);

      if (needPaidCount > 0) {
        const rule = await prisma.pricingRule.findUnique({
          where: { provider_messageType: { provider: active.provider === 'AUTO' ? 'BAILEYS' : active.provider.toUpperCase(), messageType: 'TEXT' } }
        });
        const price = rule ? rule.price : 0.10;
        const totalCost = needPaidCount * price;

        const ownerMember = await prisma.teamMember.findFirst({ where: { workspaceId, role: 'OWNER' } });
        const owner = await prisma.user.findUnique({ where: { id: ownerMember.userId } });

        if (owner.walletBalance < totalCost) {
          return res.status(400).json({ error: `Insufficient Wallet Balance. Campaign requires ₹${totalCost.toFixed(2)} (wallet balance: ₹${owner.walletBalance.toFixed(2)})` });
        }
      }
    } else {
      const messagesCount = await prisma.message.count({
        where: {
          workspaceId,
          createdAt: { gte: sub.updatedAt },
          status: { in: ['SENT', 'DELIVERED', 'READ'] }
        }
      });
      const remainingAllowance = sub.plan.messagesLimit - messagesCount;
      const needPaidCount = Math.max(0, formattedReceivers.length - remainingAllowance);

      if (needPaidCount > 0) {
        const rule = await prisma.pricingRule.findUnique({
          where: { provider_messageType: { provider: active.provider === 'AUTO' ? 'BAILEYS' : active.provider.toUpperCase(), messageType: 'TEXT' } }
        });
        const price = rule ? rule.price : 0.10;
        const totalCost = needPaidCount * price;

        const ownerMember = await prisma.teamMember.findFirst({ where: { workspaceId, role: 'OWNER' } });
        const owner = await prisma.user.findUnique({ where: { id: ownerMember.userId } });

        if (owner.walletBalance < totalCost) {
          return res.status(400).json({ error: `Insufficient Wallet Balance for overage. Campaign exceeds remaining plan allowance by ${needPaidCount} messages, requiring ₹${totalCost.toFixed(2)}.` });
        }
      }
    }

    const campaign = await prisma.campaign.create({
      data: {
        name,
        workspaceId,
        totalCount: formattedReceivers.length,
        status: 'PENDING',
      },
    });

    // Write all messages to DB in PENDING
    for (const phone of formattedReceivers) {
      await prisma.message.create({
        data: {
          workspaceId,
          gatewayId: active.id,
          receiver: phone,
          type: 'TEXT',
          content: message,
          status: 'PENDING',
          campaignId: campaign.id,
        },
      });
    }

    // Trigger campaign dispatch in background queue
    await queueService.queueCampaign(campaign.id);

    res.status(202).json({
      message: 'Campaign created and queued for delivery',
      campaignId: campaign.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// Get Campaigns List
router.get('/campaigns', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(campaigns);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve campaigns' });
  }
});

module.exports = router;
