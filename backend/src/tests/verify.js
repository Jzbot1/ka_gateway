const prisma = require('../services/db');
const auth = require('../middlewares/auth');
const queue = require('../services/queue');

async function verifyAll() {
  console.log('--- STARTING WORKSPACE TESTING AND VERIFICATION SUITE ---');

  // 1. Verify DB Connection and plan structure
  try {
    const plansCount = await prisma.plan.count();
    console.log(`[✔] DB SQLite Connection Success. Plans registered: ${plansCount}`);
  } catch (e) {
    console.error('[✘] DB Verification Failed:', e.message);
    process.exit(1);
  }

  // 2. Verify Authentication helpers
  try {
    if (auth.JWT_SECRET) {
      console.log(`[✔] Auth JWT Configuration Valid. Secret found.`);
    } else {
      throw new Error('JWT Secret missing');
    }
  } catch (e) {
    console.error('[✘] Auth Verification Failed:', e.message);
    process.exit(1);
  }

  // 3. Verify Message queues initialization
  try {
    if (typeof queue.queueMessage === 'function' && typeof queue.queueCampaign === 'function') {
      console.log(`[✔] Queue Service API Exports Valid.`);
    } else {
      throw new Error('Queue methods missing from module exports');
    }
  } catch (e) {
    console.error('[✘] Queue Verification Failed:', e.message);
    process.exit(1);
  }

  console.log('--- ALL SYSTEMS GREEN: BUILD VERIFIED ---');
}

verifyAll();
