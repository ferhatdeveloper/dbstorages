/**
 * Per-project (customer) Auth — GoTrue-like MVP:
 * signup / login / refresh / password reset stub + API keys.
 */

const crypto = require('crypto');
const express = require('express');
const {
  hashPassword,
  comparePassword,
  signProjectToken,
  signRefreshToken,
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
const ACCESS_EXPIRES = process.env.PROJECT_JWT_EXPIRES || '1h';
const REFRESH_DAYS = Number(process.env.PROJECT_REFRESH_DAYS || 30);

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

async function ensureRefreshTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      revoked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(
    `ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_token TEXT`
  );
  await pool.query(
    `ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS recovery_sent_at TIMESTAMPTZ`
  );
}

async function issueSession(pool, user, row, instanceId) {
  await ensureRefreshTable(pool);
  const access_token = signProjectToken(
    { id: user.id, email: user.email },
    {
      secret: row.jwt_secret,
      instanceId,
      projectId: row.project_id,
      expiresIn: ACCESS_EXPIRES,
    }
  );
  const refresh_token = signRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_DAYS * 86400_000);
  await pool.query(
    `INSERT INTO auth.refresh_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)`,
    [user.id, refresh_token, expiresAt.toISOString()]
  );
  return {
    access_token,
    refresh_token,
    token_type: 'bearer',
    expires_in: 3600,
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.raw_user_meta_data,
      created_at: user.created_at,
    },
  };
}

function makeApiKey(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString('base64url')}`;
}

async function ensureApiKeys(row) {
  if (row.anon_key && row.service_role_key) return row;
  const anon = row.anon_key || makeApiKey('anon');
  const service = row.service_role_key || makeApiKey('service_role');
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE instances SET anon_key = COALESCE(anon_key, $2), service_role_key = COALESCE(service_role_key, $3)
       WHERE id = $1`,
      [row.id, anon, service]
    );
  } else {
    row.anon_key = anon;
    row.service_role_key = service;
  }
  row.anon_key = anon;
  row.service_role_key = service;
  return row;
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
    const session = await issueSession(pool, rows[0], row, instanceId);
    res.status(201).json({ success: true, ...session });
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

    const session = await issueSession(pool, user, row, instanceId);
    res.json({ success: true, ...session });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

router.post('/:instanceId/token', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const grant = req.body?.grant_type || 'refresh_token';
    const refresh_token = req.body?.refresh_token;
    if (grant !== 'refresh_token' || !refresh_token) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'grant_type=refresh_token and refresh_token required' },
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
    await ensureRefreshTable(pool);
    const { rows } = await pool.query(
      `SELECT rt.*, u.email, u.raw_user_meta_data, u.created_at
       FROM auth.refresh_tokens rt
       JOIN auth.users u ON u.id = rt.user_id
       WHERE rt.token = $1 AND rt.revoked = FALSE AND rt.expires_at > NOW()
       LIMIT 1`,
      [refresh_token]
    );
    if (!rows[0]) {
      return res.status(401).json({
        success: false,
        error: { code: 'unauthorized', message: 'invalid or expired refresh token' },
      });
    }
    // Rotate
    await pool.query(`UPDATE auth.refresh_tokens SET revoked = TRUE WHERE token = $1`, [
      refresh_token,
    ]);
    const user = {
      id: rows[0].user_id,
      email: rows[0].email,
      raw_user_meta_data: rows[0].raw_user_meta_data,
      created_at: rows[0].created_at,
    };
    const session = await issueSession(pool, user, row, instanceId);
    res.json({ success: true, ...session });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

/** Password reset request — returns recovery token in MVP (no email SMTP required). */
router.post('/:instanceId/recover', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const email = String(req.body?.email || '').toLowerCase();
    if (!email) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'email required' },
      });
    }
    const row = await loadInstance(instanceId);
    if (!row || row.status !== 'ready') {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Instance not ready' },
      });
    }
    const pool = await poolForInstanceRow(row);
    await ensureRefreshTable(pool);
    const token = crypto.randomBytes(24).toString('hex');
    const { rowCount } = await pool.query(
      `UPDATE auth.users SET recovery_token = $2, recovery_sent_at = NOW(), updated_at = NOW()
       WHERE email = $1`,
      [email, token]
    );
    // Always 200 to avoid email enumeration; include token only when user exists (MVP stub)
    res.json({
      success: true,
      message: 'If the email exists, a recovery token was issued.',
      ...(rowCount
        ? {
            recovery_token: token,
            note: 'MVP stub — no email sent; use POST .../recover/confirm with this token',
          }
        : {}),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

router.post('/:instanceId/recover/confirm', async (req, res) => {
  try {
    const { instanceId } = req.params;
    const { token, password } = req.body || {};
    if (!token || !password || String(password).length < 8) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation',
          message: 'token and password (min 8) required',
        },
      });
    }
    const row = await loadInstance(instanceId);
    if (!row || row.status !== 'ready') {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Instance not ready' },
      });
    }
    const pool = await poolForInstanceRow(row);
    const encrypted = await hashPassword(password);
    const { rows } = await pool.query(
      `UPDATE auth.users
       SET encrypted_password = $2, recovery_token = NULL, recovery_sent_at = NULL, updated_at = NOW()
       WHERE recovery_token = $1
       RETURNING id, email`,
      [token, encrypted]
    );
    if (!rows[0]) {
      return res.status(400).json({
        success: false,
        error: { code: 'invalid_token', message: 'invalid or expired recovery token' },
      });
    }
    res.json({ success: true, data: { id: rows[0].id, email: rows[0].email } });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

/** Platform owner: list / rotate API keys (anon + service_role) */
router.get('/:instanceId/keys', authMiddleware, async (req, res) => {
  try {
    await assertInstanceAccess(req.user.sub, req.params.instanceId);
    let row = await getInstanceForUser(req.user.sub, req.params.instanceId);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Instance not found' },
      });
    }
    row = await ensureApiKeys(row);
    res.json({
      success: true,
      data: {
        anon_key: row.anon_key,
        service_role_key: row.service_role_key,
        note: 'Use as Authorization: Bearer <key> for future gateway auth; store securely.',
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

router.post('/:instanceId/keys/rotate', authMiddleware, async (req, res) => {
  try {
    await assertInstanceAccess(req.user.sub, req.params.instanceId);
    const which = String(req.body?.key || 'both');
    let row = await getInstanceForUser(req.user.sub, req.params.instanceId);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Instance not found' },
      });
    }
    const anon =
      which === 'service_role' ? row.anon_key || makeApiKey('anon') : makeApiKey('anon');
    const service =
      which === 'anon'
        ? row.service_role_key || makeApiKey('service_role')
        : makeApiKey('service_role');
    if (isMetaReady()) {
      await getMetaPool().query(
        `UPDATE instances SET anon_key = $2, service_role_key = $3 WHERE id = $1`,
        [row.id, anon, service]
      );
    } else {
      row.anon_key = anon;
      row.service_role_key = service;
    }
    res.json({
      success: true,
      data: { anon_key: anon, service_role_key: service },
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
