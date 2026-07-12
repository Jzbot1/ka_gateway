const express = require('express');
const crypto = require('crypto');
const prisma = require('../services/db');
const { authenticate, requireRole } = require('../middlewares/auth');

const router = express.Router();

// List API Keys in Workspace
router.get('/keys', authenticate, async (req, res) => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) return res.status(400).json({ error: 'Workspace context missing' });

  try {
    const keys = await prisma.apiKey.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(keys);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve API keys' });
  }
});

// Generate API Key
router.post('/keys', authenticate, requireRole(['OWNER', 'ADMIN', 'DEVELOPER']), async (req, res) => {
  const workspaceId = req.workspaceId;
  const { type = 'LIVE', ipWhitelist } = req.body;

  try {
    const randomHex = crypto.randomBytes(24).toString('hex');
    const key = `jz${type.toLowerCase()}_${randomHex}`;

    const newKey = await prisma.apiKey.create({
      data: {
        key,
        type,
        ipWhitelist: ipWhitelist || null,
        workspaceId,
      },
    });

    res.status(201).json(newKey);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate API key' });
  }
});

// Delete API Key
router.delete('/keys/:id', authenticate, requireRole(['OWNER', 'ADMIN', 'DEVELOPER']), async (req, res) => {
  const { id } = req.params;
  const workspaceId = req.workspaceId;

  try {
    const keyObj = await prisma.apiKey.findFirst({
      where: { id, workspaceId },
    });

    if (!keyObj) return res.status(404).json({ error: 'API key not found' });

    await prisma.apiKey.delete({ where: { id } });
    res.json({ success: true, message: 'API key revoked' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

// Retrieve API Docs Metadata for Playground
router.get('/docs', (req, res) => {
  res.json({
    endpoints: [
      {
        name: 'Send Message (Text)',
        method: 'POST',
        path: '/api/messages/send-message',
        headers: { 'X-API-Key': 'YOUR_API_KEY', 'Content-Type': 'application/json' },
        body: {
          to: '15551234567',
          message: 'Hello from WhatsApp Gateway API!',
          type: 'TEXT',
        },
      },
      {
        name: 'Send Document (PDF/Docs)',
        method: 'POST',
        path: '/api/messages/send-message',
        headers: { 'X-API-Key': 'YOUR_API_KEY', 'Content-Type': 'application/json' },
        body: {
          to: '15551234567',
          type: 'DOCUMENT',
          mediaUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          message: 'Please find your monthly report attached.',
        },
      },
      {
        name: 'Send Image',
        method: 'POST',
        path: '/api/messages/send-message',
        headers: { 'X-API-Key': 'YOUR_API_KEY', 'Content-Type': 'application/json' },
        body: {
          to: '15551234567',
          type: 'IMAGE',
          mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
          message: 'Awesome artwork design',
        },
      },
      {
        name: 'Send OTP Verification',
        method: 'POST',
        path: '/api/messages/send-otp',
        headers: { 'X-API-Key': 'YOUR_API_KEY', 'Content-Type': 'application/json' },
        body: {
          to: '15551234567',
          companyName: 'JZ Store',
          validityMinutes: 5,
        },
      },
    ],
  });
});

module.exports = router;
