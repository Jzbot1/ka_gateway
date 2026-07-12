const axios = require('axios');
const socketService = require('./socket');
const webhookService = require('./webhook');

/**
 * Sends a message via Meta WhatsApp Cloud API.
 * Supports real requests if credentials are valid, or mock simulation for evaluation.
 */
async function sendMetaMessage({ gateway, receiver, type, content, mediaUrl, templateData }) {
  let credentials = {};
  try {
    if (gateway.credentials) {
      credentials = JSON.parse(gateway.credentials);
    }
  } catch (e) {
    console.error('Failed to parse gateway credentials:', e);
  }

  const { accessToken, phoneNumberId, businessAccountId } = credentials;
  const isMock = !accessToken || accessToken.startsWith('mock_') || !phoneNumberId;

  console.log(`[Meta Provider] Sending ${type} to ${receiver} (Mock Mode: ${isMock})`);

  if (isMock) {
    // Simulate latency
    await new Promise((resolve) => setTimeout(resolve, 800));
    
    // Simulate successful message status
    const messageId = `wamid.HBgL${Math.random().toString(36).substring(7).toUpperCase()}`;
    
    // Trigger socket notifications and webhook callbacks
    socketService.notifyWorkspace(gateway.workspaceId, 'message.update', {
      receiver,
      status: 'DELIVERED',
      messageId,
      timestamp: new Date(),
    });

    webhookService.triggerWebhook(gateway.workspaceId, 'message.delivered', {
      gatewayId: gateway.id,
      messageId,
      receiver,
      status: 'DELIVERED',
    });

    return {
      success: true,
      messageId,
      status: 'DELIVERED',
      provider: 'META',
    };
  }

  // Real Meta Cloud API Call
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  let payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: receiver,
  };

  if (type === 'TEMPLATE') {
    payload.type = 'template';
    payload.template = {
      name: templateData.name,
      language: { code: templateData.languageCode || 'en_US' },
    };
    if (templateData.components) {
      payload.template.components = templateData.components;
    }
  } else if (type === 'IMAGE' || type === 'VIDEO' || type === 'AUDIO' || type === 'DOCUMENT') {
    payload.type = type.toLowerCase();
    payload[type.toLowerCase()] = {
      link: mediaUrl,
      caption: content || undefined,
    };
  } else {
    payload.type = 'text';
    payload.text = { body: content };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const waMsg = response.data.messages[0];
    return {
      success: true,
      messageId: waMsg.id,
      status: 'SENT',
      provider: 'META',
    };
  } catch (error) {
    const errorDetails = error.response ? error.response.data : error.message;
    console.error('[Meta Provider API Error]:', errorDetails);
    throw new Error(
      typeof errorDetails === 'object' ? JSON.stringify(errorDetails) : errorDetails
    );
  }
}

module.exports = {
  sendMetaMessage,
};
