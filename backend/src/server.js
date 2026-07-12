require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const { initSocket } = require('./services/socket');
const prisma = require('./services/db');

// Route imports
const authRoutes = require('./routes/auth');
const workspaceRoutes = require('./routes/workspace');
const gatewayRoutes = require('./routes/gateways');
const messageRoutes = require('./routes/messages');
const developerRoutes = require('./routes/developers');
const billingRoutes = require('./routes/billing');
const resellerRoutes = require('./routes/reseller');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);

// CORS Config
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// Payload Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.IO Initialization
initSocket(server);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Mounting Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/gateways', gatewayRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/developers', developerRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/reseller', resellerRoutes);
app.use('/api/admin', adminRoutes);

// Seed plans on system boot
async function seedOnBoot() {
  try {
    const plansData = [
      { name: 'Free', price: 0, gatewayLimit: 1, messagesLimit: 1000, apiLimit: 500, teamLimit: 1, webhooksLimit: 1, brandingEnabled: false, priorityQueue: false },
      { name: 'Starter', price: 19, gatewayLimit: 3, messagesLimit: 10000, apiLimit: 5000, teamLimit: 3, webhooksLimit: 2, brandingEnabled: true, priorityQueue: false },
      { name: 'Business', price: 49, gatewayLimit: 10, messagesLimit: 50000, apiLimit: 25000, teamLimit: 10, webhooksLimit: 5, brandingEnabled: true, priorityQueue: true },
      { name: 'Enterprise', price: 149, gatewayLimit: 99, messagesLimit: 999999, apiLimit: 999999, teamLimit: 99, webhooksLimit: 99, brandingEnabled: true, priorityQueue: true },
    ];

    for (const plan of plansData) {
      await prisma.plan.upsert({
        where: { name: plan.name },
        update: plan,
        create: plan,
      });
    }

    console.log('[System Boot] Subscription plans successfully seeded / verified.');
  } catch (error) {
    console.error('[System Boot] Failed to seed subscription plans:', error.message);
  }
}

const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  console.log(`[Server] WhatsApp Gateway backend listening on port ${PORT}`);
  await seedOnBoot();
});
