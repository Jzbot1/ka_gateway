const jwt = require('jsonwebtoken');
const prisma = require('../services/db');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_gateway_saas';

/**
 * Combined authentication middleware that validates either JWT user tokens
 * or Developer API Keys.
 */
async function authenticate(req, res, next) {
  // 1. Check for API Key first (Developer integration)
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (apiKey) {
    try {
      const dbKey = await prisma.apiKey.findUnique({
        where: { key: apiKey },
        include: { workspace: true },
      });

      if (!dbKey) {
        return res.status(401).json({ error: 'Invalid API Key' });
      }

      // Check IP Whitelist
      if (dbKey.ipWhitelist) {
        const ipList = dbKey.ipWhitelist.split(',').map(ip => ip.trim());
        const requestIp = req.ip || req.connection.remoteAddress;
        
        // Simple match
        const matches = ipList.some(allowedIp => requestIp.includes(allowedIp) || allowedIp === '*');
        if (!matches) {
          return res.status(403).json({ error: 'IP address not whitelisted' });
        }
      }

      req.workspaceId = dbKey.workspaceId;
      req.isApiKey = true;
      return next();
    } catch (e) {
      return res.status(500).json({ error: 'Internal API Key verification error' });
    }
  }

  // 2. Check for Bearer JWT token (Dashboard users)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const dbUser = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!dbUser) {
      return res.status(401).json({ error: 'User not found' });
    }
    if (dbUser.isBlocked) {
      return res.status(403).json({ error: 'Your account is blocked / suspended. Contact administration.' });
    }

    req.user = decoded;
    
    // Check if user workspace is specified in header
    const requestedWorkspaceId = req.headers['x-workspace-id'];
    if (requestedWorkspaceId) {
      const membership = await prisma.teamMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: decoded.id,
            workspaceId: requestedWorkspaceId,
          },
        },
      });

      if (membership) {
        req.workspaceId = requestedWorkspaceId;
        req.userRole = membership.role;
      }
    }

    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired access token' });
  }
}

/**
 * Access control middleware based on member roles inside a workspace.
 * Roles: OWNER, ADMIN, MANAGER, SUPPORT, DEVELOPER, BILLING
 */
function requireRole(allowedRoles) {
  return (req, res, next) => {
    if (req.isApiKey) {
      // API Keys bypass user role checks but operate in workspace bounds
      return next();
    }

    if (!req.userRole) {
      return res.status(403).json({ error: 'No workspace context selected' });
    }

    if (req.userRole === 'OWNER') {
      return next(); // Owner has full access to everything
    }

    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions for this workspace action' });
    }

    next();
  };
}

module.exports = {
  authenticate,
  requireRole,
  JWT_SECRET,
};
