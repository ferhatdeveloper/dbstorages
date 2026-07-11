const express = require('express');
const {
  signToken,
  hashPassword,
  comparePassword,
  authMiddleware,
} = require('../lib/auth');
const { isMetaReady, getMetaPool } = require('../lib/db');
const { primaryScopeForUser } = require('../lib/rbac');
const store = require('../lib/store');

const router = express.Router();

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role || 'member',
    createdAt: u.created_at || u.createdAt,
  };
}

async function findUserByEmail(email) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      'SELECT * FROM platform_users WHERE email = $1',
      [email.toLowerCase()]
    );
    return rows[0] || null;
  }
  return store.users.get(email.toLowerCase()) || null;
}

async function findUserById(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      'SELECT * FROM platform_users WHERE id = $1',
      [id]
    );
    return rows[0] || null;
  }
  for (const u of store.users.values()) {
    if (u.id === id) return u;
  }
  return null;
}

async function createUser({ email, name, password, role = 'member' }) {
  const id = store.newId('usr');
  const password_hash = await hashPassword(password);
  const created_at = new Date().toISOString();

  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO platform_users (id, email, name, password_hash, role, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, email.toLowerCase(), name, password_hash, role, created_at]
    );
    return { id, email: email.toLowerCase(), name, role, created_at };
  }

  const user = {
    id,
    email: email.toLowerCase(),
    name,
    password_hash,
    role,
    created_at,
  };
  store.users.set(user.email, user);
  return user;
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, firstName, lastName } = req.body || {};
    const fullName =
      name ||
      [firstName, lastName].filter(Boolean).join(' ').trim() ||
      email?.split('@')[0];

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

    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: { code: 'conflict', message: 'email already registered' },
      });
    }

    const user = await createUser({ email, name: fullName, password });

    // Auto-create tenant + project for onboarding
    const tenantId = store.newId('ten');
    const projectId = store.newId('prj');
    const now = new Date().toISOString();

    if (isMetaReady()) {
      const pool = getMetaPool();
      await pool.query(
        `INSERT INTO tenants (id, name, owner_user_id, created_at) VALUES ($1,$2,$3,$4)`,
        [tenantId, `${fullName} Org`, user.id, now]
      );
      await pool.query(
        `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1,$2,'owner')`,
        [user.id, tenantId]
      );
      await pool.query(
        `INSERT INTO projects (id, tenant_id, name, env, created_at) VALUES ($1,$2,$3,'dev',$4)`,
        [projectId, tenantId, 'Default Project', now]
      );
    } else {
      store.tenants.push({
        id: tenantId,
        name: `${fullName} Org`,
        owner_user_id: user.id,
        created_at: now,
      });
      store.memberships.push({
        user_id: user.id,
        tenant_id: tenantId,
        role: 'owner',
      });
      store.projects.push({
        id: projectId,
        tenant_id: tenantId,
        name: 'Default Project',
        env: 'dev',
        created_at: now,
      });
    }

    const scope = await primaryScopeForUser(user.id);
    const token = signToken(user, scope);
    res.status(201).json({
      success: true,
      token,
      user: publicUser(user),
      tenantId: scope.tenantId || tenantId,
      projectId: scope.projectId || projectId,
    });
  } catch (err) {
    console.error('register error', err);
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'email and password required' },
      });
    }

    let user = await findUserByEmail(email);

    // Bootstrap demo user if missing
    if (!user && email.toLowerCase() === 'demo@graphcore.com' && password === 'demo123') {
      user = await createUser({
        email: 'demo@graphcore.com',
        name: 'Demo Kullanıcı',
        password: 'demo123',
        role: 'admin',
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'unauthorized', message: 'invalid credentials' },
      });
    }

    const ok = await comparePassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: { code: 'unauthorized', message: 'invalid credentials' },
      });
    }

    const scope = await primaryScopeForUser(user.id);
    const token = signToken(user, scope);
    res.json({
      success: true,
      token,
      user: publicUser(user),
      tenantId: scope.tenantId,
      projectId: scope.projectId,
    });
  } catch (err) {
    console.error('login error', err);
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.post('/logout', (_req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'user not found' },
      });
    }
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

// Back-compat alias used by older clients
router.get('/user', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.sub);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'user not found' },
      });
    }
    res.json({ success: true, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

module.exports = router;
