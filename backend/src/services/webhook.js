const axios = require('axios');
const crypto = require('crypto');
const prisma = require('./db');

/**
 * Dispatches a webhook notification to external URLs registered in a workspace.
 * @param {string} workspaceId - Tenant workspace identifier
 * @param {string} event - Event name (e.g. message.sent, gateway.connected)
 * @param {object} payload - Payloads data
 */
async function triggerWebhook(workspaceId, event, payload) {
  try {
    const webhooks = await prisma.webhook.findMany({
      where: { workspaceId },
    });

    const timestamp = Date.now();
    const dataToSend = {
      event,
      timestamp,
      data: payload,
    };

    const stringifiedPayload = JSON.stringify(dataToSend);

    for (const webhook of webhooks) {
      // Check if webhook is subscribed to the event or supports all
      const subscribedEvents = webhook.events.split(',').map(e => e.trim());
      if (!subscribedEvents.includes('*') && !subscribedEvents.includes(event)) {
        continue;
      }

      // Compute HMAC signature for security Verification
      const signature = crypto
        .createHmac('sha256', webhook.secret)
        .update(stringifiedPayload)
        .digest('hex');

      // Async dispatch without blocking
      axios.post(webhook.url, dataToSend, {
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Event': event,
          'X-Gateway-Signature': signature,
          'X-Gateway-Timestamp': timestamp.toString(),
        },
        timeout: 8000,
      }).catch(err => {
        console.error(`Webhook delivery failure to ${webhook.url} for event ${event}:`, err.message);
      });
    }
  } catch (error) {
    console.error('Error dispatching webhook event:', error);
  }
}

module.exports = {
  triggerWebhook,
};
