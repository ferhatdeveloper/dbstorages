/**
 * Per-project (customer) Auth — minimal GoTrue-like signup/login.
 * Platform Auth (/api/auth) remains for the GraphCore dashboard.
 * Project Auth issues JWTs signed with the instance jwt_secret.
 */

const express = require('express');
const {
  hashPassword,
  comparePassword,
  signProjectToken,
  authMiddleware,
} = require('../lib/auth');
const {
  resolveTenantPool,
  getMetaPool,
  isMetaReady,
  getPoolForConnection,
  internalConnFromInstanceRow,
} = require('../lib/db');
const { assertInstanceAccess, getInstanceForUser } = require('../lib/rbac');
const store = require('../lib/store');

const router = express.Router();

async function loadInstance(instanceId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM instances WHERE id = $1 AND status <> 'deleted' LIMIT 1`,
      [instanceId]
    );
    return rows[0] || null;
  }
  return store.instances.find((i) => i.id === instanceId) || null;
}

async function poolForInstanceRow(row) {
  const conn = internalConnFromInstanceRow(row);
  if (!conn) throw Object.assign(new Error('Instance has no DB'), { status: 503 });
  return getPoolForConnection(conn);
}

router.post('/:instanceId/signup', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { email, password, data: meta } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'email and password required' },
      });
    }
    if (String(password).length < 8) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'password must be at least 8 characters' },
      });
    }

    const row = await loadInstance(instanceId);
    if (!row || row.status !== 'ready') {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Instance not ready' },
      });
    }
    if (!row.jwt_secret) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'auth_unconfigured',
          message: 'Instance jwt_secret missing — re-provision or set secret',
        },
      });
    }

    const pool = await poolForInstanceRow(row);
    const encrypted = await hashPassword(password);
    const { rows } = await pool.query(
      `INSERT INTO auth.users (email, encrypted_password, raw_user_meta_data)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, email, raw_user_meta_data, created_at`,
      [String(email).toLowerCase(), encrypted, JSON.stringify(meta || {})]
    );
    const user = rows[0];
    const access_token = signProjectToken(
      { id: user.id, email: user.email },
      {
        secret: row.jwt_secret,
        instanceId,
        projectId: row.project_id,
      }
    );

    res.status(201).json({
      success: true,
      access_token,
      token_type: 'bearer',
      expires_in: 604800,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.raw_user_meta_data,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        success: false,
        error: { code: 'conflict', message: 'email already registered' },
      });
    }
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

router.post('/:instanceId/login', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'email and password required' },
      });
    }

    const row = await loadInstance(instanceId);
    if (!row || row.status !== 'ready' || !row.jwt_secret) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Instance not ready' },
      });
    }

    const pool = await poolForInstanceRow(row);
    const { rows } = await pool.query(
      `SELECT id, email, encrypted_password, raw_user_meta_data, created_at
       FROM auth.users WHERE email = $1 LIMIT 1`,
      [String(email).toLowerCase()]
    );
    const user = rows[0];
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'unauthorized', message: 'invalid credentials' },
      });
    }
    const ok = await comparePassword(password, user.encrypted_password);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: { code: 'unauthorized', message: 'invalid credentials' },
      });
    }

    const access_token = signProjectToken(
      { id: user.id, email: user.email },
      {
        secret: row.jwt_secret,
        instanceId,
        projectId: row.project_id,
      }
    );

    res.json({
      success: true,
      access_token,
      token_type: 'bearer',
      expires_in: 604800,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.raw_user_meta_data,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

/** Platform owner: list project auth users for an instance */
router.get('/:instanceId/users', authMiddleware, async (req, res) => {
  try {
    const { instanceId } = req.params;
    await assertInstanceAccess(req.user.sub, instanceId);
    const row = await getInstanceForUser(req.user.sub, instanceId);
    const pool = await resolveTenantPool({
      instanceId,
      userId: req.user.sub,
      requireAuth: true,
    });
    const { rows } = await pool.query(
      `SELECT id, email, raw_user_meta_data, created_at FROM auth.users ORDER BY created_at DESC LIMIT 200`
    );
    res.json({
      success: true,
      data: rows,
      jwtSecretConfigured: Boolean(row?.jwt_secret),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

module.exports = router;
