const ioredis = require('ioredis');
const socketService = require('./socket');
const webhookService = require('./webhook');

let useRedis = false;
let redisClient = null;
let messageQueue = null;
let campaignQueue = null;

// Initialize Redis link safely
if (process.env.REDIS_HOST || process.env.REDIS_URL) {
  try {
    const redisConfig = process.env.REDIS_URL
      ? {
          // BullMQ requires maxRetriesPerRequest: null
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          ...(process.env.REDIS_URL && { lazyConnect: false }),
        }
      : {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT) || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
        };

    redisClient = process.env.REDIS_URL
      ? new ioredis(process.env.REDIS_URL, redisConfig)
      : new ioredis(redisConfig);
    
    redisClient.on('connect', () => {
      console.log('[Queue] Connected to Redis. Initializing BullMQ.');
      useRedis = true;
      initBullMQ();
    });

    redisClient.on('error', (err) => {
      console.warn('[Queue] Redis connection issue:', err.message);
      console.log('[Queue] Falling back to In-Memory Queue.');
      useRedis = false;
    });
  } catch (e) {
    console.error('[Queue] Failed to initialize Redis client:', e.message);
  }
} else {
  console.log('[Queue] No Redis environment variables defined. Running on In-Memory Queue.');
}

// In-Memory Queue Implementation
const memoryQueue = [];
let memoryQueueProcessing = false;

async function processMemoryQueue() {
  if (memoryQueueProcessing || memoryQueue.length === 0) return;
  memoryQueueProcessing = true;

  while (memoryQueue.length > 0) {
    const job = memoryQueue.shift();
    try {
      console.log(`[Memory Queue] Processing job ${job.id}`);
      await job.handler(job.data);
    } catch (e) {
      console.error(`[Memory Queue] Job ${job.id} failed:`, e.message);
      if (job.retries > 0) {
        job.retries -= 1;
        console.log(`[Memory Queue] Re-queueing job ${job.id}. Retries left: ${job.retries}`);
        // Delay retry
        setTimeout(() => {
          memoryQueue.push(job);
          processMemoryQueue();
        }, 3000);
      }
    }
  }

  memoryQueueProcessing = false;
}

function addMemoryJob(id, data, retries, handler) {
  memoryQueue.push({ id, data, retries, handler });
  console.log(`[Memory Queue] Added job ${id}`);
  processMemoryQueue();
}

// BullMQ placeholder initialization if Redis is connected
function initBullMQ() {
  const { Queue, Worker } = require('bullmq');
  
  const connection = redisClient;

  messageQueue = new Queue('message-queue', { connection });
  campaignQueue = new Queue('campaign-queue', { connection });

  // Initialize workers
  new Worker('message-queue', async (job) => {
    await processMessageJob(job.data);
  }, { connection });

  new Worker('campaign-queue', async (job) => {
    await processCampaignJob(job.data);
  }, { connection });
}

// Concrete Job Processing Handlers
async function processMessageJob(data) {
  const prisma = require('./db');
  const metaService = require('./whatsapp-meta');
  const baileysService = require('./whatsapp-baileys');

  const { messageId } = data;

  const msg = await prisma.message.findUnique({
    where: { id: messageId },
    include: { gateway: true, workspace: true },
  });

  if (!msg || !msg.gateway) {
    throw new Error('Message or Gateway not found in DB');
  }

  // Auto Provider Logic
  let activeProvider = msg.gateway.provider;
  if (activeProvider === 'AUTO') {
    if (msg.gateway.status === 'CONNECTED' && msg.gateway.phoneNumber) {
      activeProvider = 'BAILEYS';
    } else {
      activeProvider = 'META';
    }
  }

  // Perform real billing deduction
  const billingService = require('./billing-service');
  const chargeResult = await billingService.checkAndDeductMessageCharge(
    msg.workspaceId,
    activeProvider,
    msg.type
  );

  if (!chargeResult.allowed) {
    const updatedMsg = await prisma.message.update({
      where: { id: messageId },
      data: { status: 'FAILED', errorMessage: chargeResult.error },
    });
    socketService.notifyWorkspace(msg.workspaceId, 'message.update', updatedMsg);
    webhookService.triggerWebhook(msg.workspaceId, 'message.failed', updatedMsg);
    
    if (msg.campaignId) {
      await prisma.campaign.update({
        where: { id: msg.campaignId },
        data: { failedCount: { increment: 1 } },
      });
    }
    return;
  }

  try {
    let result;
    if (activeProvider === 'META') {
      result = await metaService.sendMetaMessage({
        gateway: msg.gateway,
        receiver: msg.receiver,
        type: msg.type,
        content: msg.content,
        mediaUrl: msg.mediaUrl,
        templateData: { name: msg.content }, // Fallback template structure
      });
    } else {
      result = await baileysService.sendBaileysMessage({
        gateway: msg.gateway,
        receiver: msg.receiver,
        type: msg.type,
        content: msg.content,
        mediaUrl: msg.mediaUrl,
      });
    }

    // Update Message DB Log
    const updatedMsg = await prisma.message.update({
      where: { id: messageId },
      data: {
        status: result.status || 'SENT',
        sender: result.sender || msg.sender,
        provider: result.provider,
      },
    });

    socketService.notifyWorkspace(msg.workspaceId, 'message.update', updatedMsg);
    webhookService.triggerWebhook(msg.workspaceId, 'message.sent', updatedMsg);

    // Update campaign counters if associated
    if (msg.campaignId) {
      await prisma.campaign.update({
        where: { id: msg.campaignId },
        data: { sentCount: { increment: 1 } },
      });
    }
  } catch (error) {
    console.error(`[Queue Handler Error] Message ID ${messageId}:`, error.message);
    
    // Auto-fallback: If Auto failed with primary provider, try alternative before marking fail
    if (msg.gateway.provider === 'AUTO' && activeProvider === 'META') {
      console.log(`[Queue Fallback] Meta provider failed. Re-trying message ${messageId} via Baileys.`);
      // Run Baileys flow as fallback
      try {
        const result = await baileysService.sendBaileysMessage({
          gateway: msg.gateway,
          receiver: msg.receiver,
          type: msg.type,
          content: msg.content,
          mediaUrl: msg.mediaUrl,
        });

        const updatedMsg = await prisma.message.update({
          where: { id: messageId },
          data: {
            status: result.status || 'SENT',
            provider: 'BAILEYS',
          },
        });
        socketService.notifyWorkspace(msg.workspaceId, 'message.update', updatedMsg);
        return;
      } catch (innerError) {
        console.error('[Queue Fallback Failed] Secondary Baileys fallback also failed:', innerError.message);
      }
    }

    // Mark as failed in database
    const updatedMsg = await prisma.message.update({
      where: { id: messageId },
      data: { status: 'FAILED', errorMessage: error.message },
    });

    socketService.notifyWorkspace(msg.workspaceId, 'message.update', updatedMsg);
    webhookService.triggerWebhook(msg.workspaceId, 'message.failed', updatedMsg);

    if (msg.campaignId) {
      await prisma.campaign.update({
        where: { id: msg.campaignId },
        data: { failedCount: { increment: 1 } },
      });
    }

    throw error; // Let the queue handle retry policies
  }
}

async function processCampaignJob(data) {
  const prisma = require('./db');
  const { campaignId } = data;

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
  });

  if (!campaign || campaign.status === 'COMPLETED') return;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'RUNNING' },
  });

  const pendingMessages = await prisma.message.findMany({
    where: { campaignId, status: 'PENDING' },
  });

  console.log(`[Campaign Queue] Sending ${pendingMessages.length} messages for campaign ${campaign.name}`);

  for (const msg of pendingMessages) {
    // Add each message to message queue
    await queueMessage(msg.id);
    // Slight pause to avoid spamming
    await new Promise(r => setTimeout(r, 400));
  }

  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'COMPLETED' },
  });

  webhookService.triggerWebhook(campaign.workspaceId, 'campaign.completed', {
    campaignId,
    name: campaign.name,
    status: 'COMPLETED',
  });
}

// Queue API Methods
async function queueMessage(messageId) {
  if (useRedis && messageQueue) {
    await messageQueue.add(`msg-${messageId}`, { messageId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });
  } else {
    addMemoryJob(`msg-${messageId}`, { messageId }, 3, processMessageJob);
  }
}

async function queueCampaign(campaignId) {
  if (useRedis && campaignQueue) {
    await campaignQueue.add(`campaign-${campaignId}`, { campaignId });
  } else {
    addMemoryJob(`campaign-${campaignId}`, { campaignId }, 1, processCampaignJob);
  }
}

module.exports = {
  queueMessage,
  queueCampaign,
};
