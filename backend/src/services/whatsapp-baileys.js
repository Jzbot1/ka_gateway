const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const path = require('path');
const fs = require('fs');
const prisma = require('./db');
const socketService = require('./socket');
const webhookService = require('./webhook');

const activeSessions = new Map();
const lastQrCodes = new Map();

/**
 * Gets or initializes a Baileys session for a gateway.
 */
async function getBaileysSession(gatewayId) {
  if (activeSessions.has(gatewayId)) {
    return activeSessions.get(gatewayId);
  }

  // Load gateway details
  const gateway = await prisma.gateway.findUnique({
    where: { id: gatewayId },
  });

  if (!gateway) {
    throw new Error('Gateway not found');
  }

  // Handle mock simulation gateways
  if (gateway.name.includes('[Mock]') || gateway.name.includes('mock') || gateway.credentials === 'mock') {
    return initMockSession(gateway);
  }

  return initRealSession(gateway);
}

/**
 * Initializes a simulated/mock WhatsApp session for demo/testing.
 */
function initMockSession(gateway) {
  console.log(`[Baileys Provider] Initializing Mock/Simulated Session for Gateway: ${gateway.name}`);

  const mockClient = {
    sendMessage: async (jid, content) => {
      // Simulate network latency
      await new Promise(r => setTimeout(r, 600));
      const messageId = `BAILEYS_MOCK_${Math.random().toString(36).substring(7).toUpperCase()}`;
      
      socketService.notifyWorkspace(gateway.workspaceId, 'message.update', {
        receiver: jid.split('@')[0],
        status: 'DELIVERED',
        messageId,
        timestamp: new Date(),
      });

      webhookService.triggerWebhook(gateway.workspaceId, 'message.delivered', {
        gatewayId: gateway.id,
        messageId,
        receiver: jid.split('@')[0],
        status: 'DELIVERED',
      });

      return { key: { id: messageId } };
    },
    logout: async () => {
      await prisma.gateway.update({
        where: { id: gateway.id },
        data: { status: 'DISCONNECTED' },
      });
      socketService.notifyWorkspace(gateway.workspaceId, 'gateway.status', {
        gatewayId: gateway.id,
        status: 'DISCONNECTED',
      });
      activeSessions.delete(gateway.id);
    },
    isMock: true,
  };

  // Auto-connect after 3 seconds to simulate scan or load
  setTimeout(async () => {
    await prisma.gateway.update({
      where: { id: gateway.id },
      data: { status: 'CONNECTED', phoneNumber: '+1 (555) 019-9000' },
    });
    socketService.notifyWorkspace(gateway.workspaceId, 'gateway.status', {
      gatewayId: gateway.id,
      status: 'CONNECTED',
      phoneNumber: '+1 (555) 019-9000',
    });
    webhookService.triggerWebhook(gateway.workspaceId, 'gateway.connected', {
      gatewayId: gateway.id,
      status: 'CONNECTED',
    });
  }, 3000);

  activeSessions.set(gateway.id, mockClient);
  return mockClient;
}

/**
 * Initializes a real Baileys session.
 */
async function initRealSession(gateway) {
  const sessionDir = path.join(__dirname, '..', '..', 'data', 'sessions', gateway.id);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    defaultQueryTimeoutMs: undefined,
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false,
  });

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`[Baileys] New QR generated for gateway: ${gateway.id}`);
      lastQrCodes.set(gateway.id, qr);
      // Broadcast QR code via socket
      socketService.notifyWorkspace(gateway.workspaceId, 'qr.update', {
        gatewayId: gateway.id,
        qr: qr,
      });
      webhookService.triggerWebhook(gateway.workspaceId, 'qr.updated', {
        gatewayId: gateway.id,
        qr: qr,
      });
    }

    if (connection === 'close') {
      lastQrCodes.delete(gateway.id);
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log(`[Baileys] Connection closed for gateway: ${gateway.id}. Reconnecting: ${shouldReconnect}`);

      if (shouldReconnect) {
        activeSessions.delete(gateway.id);
        // Retry connection
        setTimeout(() => getBaileysSession(gateway.id), 5000);
      } else {
        // Logged out
        try {
          await prisma.gateway.update({
            where: { id: gateway.id },
            data: { status: 'DISCONNECTED' },
          });
          // Clean up corrupt session directory
          if (fs.existsSync(sessionDir)) {
            fs.rmSync(sessionDir, { recursive: true, force: true });
          }
        } catch (dbError) {
          console.warn(`[Baileys] Failed to disconnect gateway ${gateway.id} in DB:`, dbError.message);
        }
        socketService.notifyWorkspace(gateway.workspaceId, 'gateway.status', {
          gatewayId: gateway.id,
          status: 'DISCONNECTED',
        });
        webhookService.triggerWebhook(gateway.workspaceId, 'gateway.disconnected', {
          gatewayId: gateway.id,
          status: 'DISCONNECTED',
        });
        activeSessions.delete(gateway.id);
      }
    } else if (connection === 'open') {
      console.log(`[Baileys] Connection opened successfully for gateway: ${gateway.id}`);
      lastQrCodes.delete(gateway.id);
      
      const phone = sock.user.id.split(':')[0];
      try {
        await prisma.gateway.update({
          where: { id: gateway.id },
          data: { status: 'CONNECTED', phoneNumber: phone },
        });
      } catch (dbError) {
        console.warn(`[Baileys] Failed to update gateway ${gateway.id} in DB:`, dbError.message);
        if (dbError.code === 'P2025') {
          sock.logout();
          activeSessions.delete(gateway.id);
          return;
        }
      }

      socketService.notifyWorkspace(gateway.workspaceId, 'gateway.status', {
        gatewayId: gateway.id,
        status: 'CONNECTED',
        phoneNumber: phone,
      });

      webhookService.triggerWebhook(gateway.workspaceId, 'gateway.connected', {
        gatewayId: gateway.id,
        status: 'CONNECTED',
      });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  activeSessions.set(gateway.id, sock);
  return sock;
}

/**
 * Sends a WhatsApp message using Baileys connection.
 */
async function sendBaileysMessage({ gateway, receiver, type, content, mediaUrl }) {
  const client = await getBaileysSession(gateway.id);
  const formattedJid = `${receiver.replace(/[^0-9]/g, '')}@s.whatsapp.net`;

  let payload = {};

  if (type === 'IMAGE') {
    payload = { image: { url: mediaUrl }, caption: content };
  } else if (type === 'VIDEO') {
    payload = { video: { url: mediaUrl }, caption: content };
  } else if (type === 'AUDIO') {
    payload = { audio: { url: mediaUrl }, mimetype: 'audio/mp4', ptt: true };
  } else if (type === 'DOCUMENT') {
    const filename = path.basename(mediaUrl.split('?')[0]) || 'document.pdf';
    payload = { document: { url: mediaUrl }, mimetype: 'application/pdf', fileName: filename, caption: content };
  } else if (type === 'LOCATION') {
    // Expected content format: "lat,lng,name,address"
    const parts = content.split(',');
    payload = {
      location: {
        degreesLatitude: parseFloat(parts[0]) || 0,
        degreesLongitude: parseFloat(parts[1]) || 0,
        name: parts[2] || 'Location',
        address: parts[3] || '',
      },
    };
  } else if (type === 'CONTACT') {
    // Expected content format: "displayname,phone"
    const parts = content.split(',');
    const name = parts[0] || 'Contact';
    const phone = parts[1] || receiver;
    const vcard = 'BEGIN:VCARD\n' +
      'VERSION:3.0\n' +
      `FN:${name}\n` +
      `TEL;type=CELL;type=VOICE;waid=${phone}:${phone}\n` +
      'END:VCARD';
    payload = {
      contacts: {
        displayName: name,
        contacts: [{ vcard }],
      },
    };
  } else {
    // Text message
    payload = { text: content };
  }

  const response = await client.sendMessage(formattedJid, payload);

  return {
    success: true,
    messageId: response.key.id,
    status: 'SENT',
    provider: 'BAILEYS',
  };
}

function getLastQr(gatewayId) {
  return lastQrCodes.get(gatewayId) || null;
}

module.exports = {
  getBaileysSession,
  sendBaileysMessage,
  getLastQr,
};
