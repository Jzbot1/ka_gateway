const express = require('express');
const prisma = require('../services/db');
const { authenticate, requireRole } = require('../middlewares/auth');
const baileysService = require('../services/whatsapp-baileys');

const router = express.Router();

// Get Gateways list in Workspace
router.get('/', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context missing' });

  try {
    const gateways = await prisma.gateway.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(gateways);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve gateways' });
  }
});

// Create Gateway
router.post('/', authenticate, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  const workspaceId = req.workspaceId;
  const { name, provider, credentials } = req.body;

  if (!name) return res.status(400).json({ error: 'Gateway name is required' });

  try {
    // Check gateway limit against subscription
    const sub = await prisma.subscription.findUnique({
      where: { workspaceId },
      include: { plan: true },
    });

    const activeCount = await prisma.gateway.count({ where: { workspaceId } });
    const limit = sub?.plan?.gatewayLimit || 1;

    if (activeCount >= limit) {
      return res.status(400).json({
        error: `Gateway limit reached for your current plan (${limit}). Please upgrade.`,
      });
    }

    const gateway = await prisma.gateway.create({
      data: {
        name,
        provider: provider || 'AUTO',
        credentials: credentials ? JSON.stringify(credentials) : null,
        workspaceId,
        status: 'DISCONNECTED',
      },
    });

    // If it's a simulated mock or has predefined mock credentials, trigger auto connect
    if (name.includes('[Mock]') || name.includes('mock') || credentials?.accessToken === 'mock') {
      await baileysService.getBaileysSession(gateway.id);
    }

    res.status(201).json(gateway);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create gateway' });
  }
});

// Get QR Code / Trigger pairing for Baileys
router.get('/:id/qr', authenticate, async (req, res) => {
  const { id } = req.params;
  const workspaceId = req.workspaceId;

  try {
    const gateway = await prisma.gateway.findFirst({
      where: { id, workspaceId },
    });

    if (!gateway) {
      return res.status(404).json({ error: 'Gateway not found' });
    }

    if (gateway.provider === 'META') {
      return res.status(400).json({ error: 'QR Login not supported for official Meta Cloud API provider' });
    }

    // Trigger/Get the Baileys session. QR updates are sent over Socket.IO and webhooks.
    baileysService.getBaileysSession(gateway.id).catch(e => {
      console.error(`Error loading session for gateway ${gateway.id}:`, e.message);
    });

    const cachedQr = baileysService.getLastQr(gateway.id);

    res.json({ 
      message: 'Pairing session initialized.',
      qr: cachedQr || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initialize pairing session' });
  }
});

// Request Pairing Code for Baileys
router.get('/:id/pairing-code', authenticate, async (req, res) => {
  const { id } = req.params;
  const { phone } = req.query;
  const workspaceId = req.workspaceId;

  if (!phone) return res.status(400).json({ error: 'Phone number is required' });

  try {
    const gateway = await prisma.gateway.findFirst({
      where: { id, workspaceId },
    });

    if (!gateway) return res.status(404).json({ error: 'Gateway not found' });

    if (gateway.provider === 'META') {
      return res.status(400).json({ error: 'Pairing Code not supported for official Meta Cloud API provider' });
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (!cleanPhone) return res.status(400).json({ error: 'Invalid phone number format' });

    // Initialize/Get the Baileys session
    const sock = await baileysService.getBaileysSession(gateway.id);

    if (sock.isMock) {
      return res.json({ code: 'MOCK-123' });
    }

    // Wait a brief moment if socket is fresh to ensure connection is registered
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Request the code
    const code = await sock.requestPairingCode(cleanPhone);
    res.json({ code });
  } catch (error) {
    console.error('[Pairing Code Error]:', error);
    res.status(500).json({ error: error.message || 'Failed to generate pairing code' });
  }
});

// Disconnect/Logout Gateway
router.post('/:id/disconnect', authenticate, requireRole(['OWNER', 'ADMIN', 'MANAGER']), async (req, res) => {
  const { id } = req.params;
  const workspaceId = req.workspaceId;

  try {
    const gateway = await prisma.gateway.findFirst({
      where: { id, workspaceId },
    });

    if (!gateway) return res.status(404).json({ error: 'Gateway not found' });

    // Remove active socket session if Baileys/Mock
    try {
      const sock = await baileysService.getBaileysSession(gateway.id);
      if (sock && sock.logout) {
        await sock.logout();
      }
    } catch (e) {
      console.warn('Session was not active in memory:', e.message);
    }

    const updated = await prisma.gateway.update({
      where: { id },
      data: { status: 'DISCONNECTED' },
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect gateway' });
  }
});

// Delete Gateway
router.delete('/:id', authenticate, requireRole(['OWNER', 'ADMIN']), async (req, res) => {
  const { id } = req.params;
  const workspaceId = req.workspaceId;

  try {
    const gateway = await prisma.gateway.findFirst({
      where: { id, workspaceId },
    });

    if (!gateway) return res.status(404).json({ error: 'Gateway not found' });

    // Clean session memory
    try {
      const sock = await baileysService.getBaileysSession(gateway.id);
      if (sock && sock.logout) await sock.logout();
    } catch (e) {}

    await prisma.gateway.delete({ where: { id } });

    res.json({ success: true, message: 'Gateway deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete gateway' });
  }
});

module.exports = router;
