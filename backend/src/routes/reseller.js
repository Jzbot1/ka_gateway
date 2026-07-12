const express = require('express');
const prisma = require('../services/db');
const { authenticate } = require('../middlewares/auth');

const router = express.Router();

// Middleware to ensure user is a reseller or admin
async function requireReseller(req, res, next) {
  if (req.user && (req.user.role === 'RESELLER' || req.user.role === 'ADMIN')) {
    return next();
  }
  return res.status(403).json({ error: 'Reseller access level required' });
}

// Get Reseller Settings
router.get('/settings', authenticate, requireReseller, async (req, res) => {
  try {
    const settings = await prisma.resellerSetting.findUnique({
      where: { userId: req.user.id },
    });
    res.json(settings || { message: 'No reseller configuration setup yet' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reseller settings' });
  }
});

// Update/Create Reseller Settings
router.put('/settings', authenticate, requireReseller, async (req, res) => {
  const { domain, brandingName, logo, colors, stripeKey, emailConfig } = req.body;

  if (!domain || !brandingName) {
    return res.status(400).json({ error: 'Domain and branding name are required' });
  }

  try {
    const settings = await prisma.resellerSetting.upsert({
      where: { userId: req.user.id },
      update: {
        domain,
        brandingName,
        logo,
        colors: colors ? JSON.stringify(colors) : null,
        stripeKey,
        emailConfig: emailConfig ? JSON.stringify(emailConfig) : null,
      },
      create: {
        userId: req.user.id,
        domain,
        brandingName,
        logo,
        colors: colors ? JSON.stringify(colors) : null,
        stripeKey,
        emailConfig: emailConfig ? JSON.stringify(emailConfig) : null,
      },
    });

    // Make sure user's role is updated to RESELLER in db
    await prisma.user.update({
      where: { id: req.user.id },
      data: { role: 'RESELLER' },
    });

    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update reseller settings' });
  }
});

// List Reseller Customers (Workspaces managed under the reseller domain or context)
router.get('/customers', authenticate, requireReseller, async (req, res) => {
  try {
    // For demo/simulation, list all workspaces created by other users as customers of this reseller portal
    const workspaces = await prisma.workspace.findMany({
      include: {
        branding: true,
        subscription: { include: { plan: true } },
      },
    });
    res.json(workspaces);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch reseller customers' });
  }
});

module.exports = router;
