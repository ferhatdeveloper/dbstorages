const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'graphcore-dev-secret-change-me';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

/**
 * Platform (dashboard) JWT.
 * Optional tenantId/projectId are claim hints; membership checks remain SoT.
 */
function signToken(user, scope = {}) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role || scope.role || 'member',
  };
  if (scope.tenantId) payload.tenantId = scope.tenantId;
  if (scope.projectId) payload.projectId = scope.projectId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

/** Project (customer) JWT — signed with per-instance secret. */
function signProjectToken(user, { secret, instanceId, projectId, expiresIn = '7d' }) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      instanceId,
      projectId: projectId || null,
      aud: 'authenticated',
    },
    secret,
    { expiresIn }
  );
}

function verifyProjectToken(token, secret) {
  return jwt.verify(token, secret);
}

async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { code: 'unauthorized', message: 'Bearer token required' },
    });
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      error: { code: 'unauthorized', message: 'Invalid or expired token' },
    });
  }
}

/** Optional auth — attaches user if token present */
function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch {
      /* ignore */
    }
  }
  next();
}

module.exports = {
  signToken,
  verifyToken,
  signProjectToken,
  verifyProjectToken,
  hashPassword,
  comparePassword,
  authMiddleware,
  optionalAuth,
  JWT_SECRET,
};
