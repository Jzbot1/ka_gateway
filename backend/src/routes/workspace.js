const express = require('express');
const prisma = require('../services/db');
const { authenticate, requireRole } = require('../middlewares/auth');

const router = express.Router();

// List Workspaces user belongs to
router.get('/', authenticate, async (req, res) => {
  try {
    const members = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      include: {
        workspace: {
          include: {
            branding: true,
            subscription: { include: { plan: true } },
          },
        },
      },
    });

    res.json(members.map(m => ({
      workspaceId: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      branding: m.workspace.branding,
      subscription: m.workspace.subscription,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve workspaces' });
  }
});

// Create Workspace
router.post('/', authenticate, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Workspace name is required' });

  try {
    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerId: req.user.id,
      },
    });

    await prisma.teamMember.create({
      data: {
        userId: req.user.id,
        workspaceId: workspace.id,
        role: 'OWNER',
      },
    });

    const branding = await prisma.companyBranding.create({
      data: {
        workspaceId: workspace.id,
        companyName: name,
      },
    });

    const freePlan = await prisma.plan.upsert({
      where: { name: 'Free' },
      update: {},
      create: { name: 'Free', price: 0, gatewayLimit: 1, messagesLimit: 1000 },
    });

    await prisma.subscription.create({
      data: {
        workspaceId: workspace.id,
        planId: freePlan.id,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({
      workspaceId: workspace.id,
      name: workspace.name,
      role: 'OWNER',
      branding,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// Get Company Branding Settings
router.get('/branding', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace header missing' });

  try {
    const branding = await prisma.companyBranding.findUnique({
      where: { workspaceId },
    });
    res.json(branding);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve branding settings' });
  }
});

// Update Company Branding Settings
router.put('/branding', authenticate, requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context missing' });

  const { companyName, logo, color, website, email, phone, address, footerText, supportNumber, signature } = req.body;

  try {
    const branding = await prisma.companyBranding.upsert({
      where: { workspaceId },
      update: { companyName, logo, color, website, email, phone, address, footerText, supportNumber, signature },
      create: { workspaceId, companyName, logo, color, website, email, phone, address, footerText, supportNumber, signature },
    });

    res.json(branding);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update branding settings' });
  }
});

// List Team Members
router.get('/team', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context missing' });

  try {
    const members = await prisma.teamMember.findMany({
      where: { workspaceId },
      include: { user: { select: { name: true, email: true } } },
    });

    res.json(members.map(m => ({
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
    })));
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Add/Invite Team Member
router.post('/team', authenticate, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  const workspaceId = req.workspaceId;
  const { email, role } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  try {
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User with this email not registered yet' });
    }

    const membership = await prisma.teamMember.create({
      data: {
        userId: targetUser.id,
        workspaceId,
        role,
      },
    });

    res.status(201).json(membership);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add team member (user may already be in team)' });
  }
});

module.exports = router;
