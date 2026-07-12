const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../services/db');
const { JWT_SECRET } = require('../middlewares/auth');

const router = express.Router();

// User Registration
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create User along with a default Workspace and Branding config
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: (email === 'zomuansangajacob523@gmail.com' || email === 'zomuansangajacob23@gmail.com') ? 'ADMIN' : 'USER',
      },
    });

    const workspace = await prisma.workspace.create({
      data: {
        name: `${name}'s Workspace`,
        ownerId: user.id,
      },
    });

    await prisma.teamMember.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        role: 'OWNER',
      },
    });

    await prisma.companyBranding.create({
      data: {
        workspaceId: workspace.id,
        companyName: `${name}'s Company`,
        color: '#3B82F6',
      },
    });

    // Seed default subscription: Free plan
    let freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
    if (!freePlan) {
      freePlan = await prisma.plan.create({
        data: {
          name: 'Free',
          price: 0,
          gatewayLimit: 1,
          messagesLimit: 1000,
          apiLimit: 500,
          teamLimit: 1,
        },
      });
    }

    await prisma.subscription.create({
      data: {
        workspaceId: workspace.id,
        planId: freePlan.id,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      workspaceId: workspace.id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

// User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        workspaces: {
          include: { workspace: true },
        },
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Default to first workspace owned/joined
    let workspaceId = user.workspaces[0]?.workspaceId || null;

    if (!workspaceId) {
      // Self-healing: create a default workspace for this user if missing
      const workspace = await prisma.workspace.create({
        data: {
          name: `${user.name || 'Admin'}'s Workspace`,
          ownerId: user.id,
        },
      });

      await prisma.teamMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' },
      });

      await prisma.companyBranding.create({
        data: {
          workspaceId: workspace.id,
          companyName: `${user.name || 'Admin'}'s Company`,
          color: '#3B82F6',
        },
      });

      let freePlan = await prisma.plan.findUnique({ where: { name: 'Free' } });
      if (!freePlan) {
        freePlan = await prisma.plan.create({
          data: {
            name: 'Free',
            price: 0,
            gatewayLimit: 1,
            messagesLimit: 1000,
            apiLimit: 500,
            teamLimit: 1,
          },
        });
      }

      await prisma.subscription.create({
        data: {
          workspaceId: workspace.id,
          planId: freePlan.id,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      workspaceId = workspace.id;
    }

    if (user.twoFactorEnabled) {
      return res.status(200).json({
        require2FA: true,
        userId: user.id,
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      workspaceId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login error' });
  }
});

// OAuth simulation (Google / GitHub)
router.post('/oauth', async (req, res) => {
  const { email, name, provider, token: oauthToken } = req.body;
  if (!email || !name) {
    return res.status(400).json({ error: 'Email and name are required' });
  }

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      include: { workspaces: { include: { workspace: true } } },
    });

    let workspaceId = null;

    if (!user) {
      // Create user
      user = await prisma.user.create({
        data: {
          email,
          name,
          password: await bcrypt.hash(Math.random().toString(36), 10), // Random password
          role: email === 'zomuansangajacob523@gmail.com' ? 'ADMIN' : 'USER',
        },
      });

      const workspace = await prisma.workspace.create({
        data: {
          name: `${name}'s Workspace`,
          ownerId: user.id,
        },
      });

      await prisma.teamMember.create({
        data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' },
      });

      await prisma.companyBranding.create({
        data: { workspaceId: workspace.id, companyName: `${name}'s Company` },
      });

      // Default plan
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

      workspaceId = workspace.id;
    } else {
      workspaceId = user.workspaces[0]?.workspaceId || null;
    }

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      workspaceId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'OAuth failed' });
  }
});

// Setup 2FA
router.post('/2fa/setup', async (req, res) => {
  // Mock generating 2FA secret
  const secret = Math.random().toString(36).substring(2, 17).toUpperCase();
  res.json({
    secret,
    qrCode: `otpauth://totp/jzgateway?secret=${secret}&issuer=jzgateway`,
  });
});

module.exports = router;
