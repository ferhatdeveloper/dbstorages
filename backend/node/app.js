const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const { initDb, isMetaReady, getMetaPool, isTenantReady, resolveTenantPool } = require('./lib/db');
const store = require('./lib/store');
const { authMiddleware, optionalAuth, verifyToken } = require('./lib/auth');
const {
  assertTenantAccess,
  assertProjectAccess,
  listMemberships,
  getInstanceForUser,
} = require('./lib/rbac');
const {
  setIo,
  roomName,
  warmListeners,
  startListenerForInstanceRow,
} = require('./lib/realtime');
const authRoutes = require('./routes/auth');
const dbRoutes = require('./routes/db');
const { router: restRoutes } = require('./routes/rest');
const projectAuthRoutes = require('./routes/projectAuth');
const { router: billingRoutes, provisionInstanceAfterPayment, updatePaymentStatus } = require('./routes/billing');
const storageRoutes = require('./routes/storage');
const functionsRoutes = require('./routes/functions');
const migrationsRoutes = require('./routes/migrations');
const { getProvider, getPackage } = require('./payments');
const provision = require('./lib/provision');

const app = express();
const server = http.createServer(app);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const io = socketIo(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const PORT = Number(process.env.NODE_PORT || process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: [FRONTEND_ORIGIN, 'http://localhost:5173'],
    credentials: true,
  })
);
app.use(morgan('dev'));

// Stripe webhook needs raw body — mount before json parser
app.post(
  '/api/billing/webhook/stripe',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const provider = getProvider('stripe');
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    const isProd =
      process.env.NODE_ENV === 'production' || process.env.REQUIRE_META_DB === '1';

    try {
      // Production: STRIPE_WEBHOOK_SECRET is required — no unsigned fallback
      if (!webhookSecret) {
        if (isProd) {
          console.error(
            '[stripe] STRIPE_WEBHOOK_SECRET missing in production — rejecting webhook'
          );
          return res.status(503).json({
            received: false,
            error:
              'STRIPE_WEBHOOK_SECRET required in production. Set it in Dokploy env.',
          });
        }
        // Dev-only fallback: accept JSON event without signature verification
        console.warn(
          '[stripe] STRIPE_WEBHOOK_SECRET unset — accepting unsigned webhook (dev only)'
        );
        const event =
          typeof req.body === 'string' || Buffer.isBuffer(req.body)
            ? JSON.parse(req.body.toString('utf8'))
            : req.body;
        if (event?.type === 'checkout.session.completed') {
          const session = event.data.object;
          const planId = session.metadata?.planId || 'pro';
          const userId = session.metadata?.userId || session.client_reference_id;
          const paymentId = session.metadata?.paymentId;
          if (userId) {
            await provisionInstanceAfterPayment({
              userId,
              planId,
              projectId: session.metadata?.projectId || null,
              provider: 'stripe',
              paymentId: paymentId || session.id,
              externalId: session.id,
            });
            if (paymentId) {
              await updatePaymentStatus(paymentId, 'succeeded', session.id);
            }
          }
        }
        return res.json({ received: true, mode: 'dev-no-secret' });
      }

      if (!provider.isConfigured()) {
        return res.status(503).json({
          received: false,
          error: 'STRIPE_SECRET_KEY not configured',
        });
      }

      const event = provider.constructWebhookEvent(req.body, sig);
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const planId = session.metadata?.planId || 'pro';
        const userId = session.metadata?.userId || session.client_reference_id;
        const paymentId = session.metadata?.paymentId;
        if (userId) {
          await provisionInstanceAfterPayment({
            userId,
            planId,
            projectId: session.metadata?.projectId || null,
            provider: 'stripe',
            paymentId: paymentId || session.id,
            externalId: session.id,
          });
          if (paymentId) {
            await updatePaymentStatus(paymentId, 'succeeded', session.id);
          }
        }
      }
      res.json({ received: true, mode: 'verified' });
    } catch (err) {
      console.error('stripe webhook error', err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Routes ---
app.use('/api/auth', authRoutes);
app.use('/api/db', dbRoutes);
app.use('/api/rest', restRoutes);
app.use('/api/project-auth', projectAuthRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/functions', functionsRoutes);
app.use('/api/migrations', migrationsRoutes);

// SQL alias used by SqlEditorPage (/api/sql/execute)
app.post('/api/sql/execute', (req, res, next) => {
  req.url = '/sql/execute';
  return dbRoutes(req, res, next);
});

app.get('/api/schema', (req, res, next) => {
  req.url = '/schema';
  return dbRoutes(req, res, next);
});

// Packages alias
app.get('/api/packages', (_req, res) => {
  const { getPackages, listProviders } = require('./payments');
  res.json({ success: true, data: getPackages(), providers: listProviders() });
});

// Domain: tenants / projects / instances — membership-scoped
function publicApiBase(req) {
  return (
    process.env.PUBLIC_API_URL ||
    `${req.protocol}://${req.get('host')}`
  ).replace(/\/$/, '');
}

function mapInstanceRow(i, req) {
  const restUrl =
    i.rest_url || `${publicApiBase(req)}/api/rest/${i.id}`;
  return {
    id: i.id,
    projectId: i.project_id,
    name: i.name,
    plan: i.plan,
    region: i.region,
    status: i.status,
    host: i.host,
    port: i.port,
    database: i.database_name,
    connectionString: i.connection_string,
    restUrl,
    jwtSecretConfigured: Boolean(i.jwt_secret),
    createdAt: i.created_at,
  };
}

app.get('/api/tenants', authMiddleware, async (req, res) => {
  try {
    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT t.* FROM tenants t
         INNER JOIN memberships m ON m.tenant_id = t.id
         WHERE m.user_id = $1
         ORDER BY t.created_at`,
        [req.user.sub]
      );
      return res.json({
        tenants: rows.map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: t.created_at,
        })),
      });
    }
    const mine = store.memberships
      .filter((m) => m.user_id === req.user.sub)
      .map((m) => m.tenant_id);
    res.json({
      tenants: store.tenants
        .filter((t) => mine.includes(t.id))
        .map((t) => ({
          id: t.id,
          name: t.name,
          createdAt: t.created_at,
        })),
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'server', message: err.message } });
  }
});

app.post('/api/tenants', authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: { code: 'validation', message: 'name required' } });
  }
  const tenant = {
    id: store.newId('ten'),
    name,
    owner_user_id: req.user.sub,
    created_at: new Date().toISOString(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO tenants (id, name, owner_user_id, created_at) VALUES ($1,$2,$3,$4)`,
      [tenant.id, tenant.name, tenant.owner_user_id, tenant.created_at]
    );
    await getMetaPool().query(
      `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1,$2,'owner')`,
      [req.user.sub, tenant.id]
    );
  } else {
    store.tenants.push(tenant);
    store.memberships.push({
      user_id: req.user.sub,
      tenant_id: tenant.id,
      role: 'owner',
    });
  }
  res.status(201).json({
    tenant: { id: tenant.id, name: tenant.name, createdAt: tenant.created_at },
  });
});

app.get('/api/projects', authMiddleware, async (req, res) => {
  const { tenantId } = req.query;
  try {
    if (tenantId) {
      await assertTenantAccess(req.user.sub, tenantId);
    }
    if (isMetaReady()) {
      const params = [req.user.sub];
      let q = `
        SELECT p.* FROM projects p
        INNER JOIN memberships m ON m.tenant_id = p.tenant_id
        WHERE m.user_id = $1`;
      if (tenantId) {
        params.push(tenantId);
        q += ` AND p.tenant_id = $2`;
      }
      q += ' ORDER BY p.created_at';
      const { rows } = await getMetaPool().query(q, params);
      return res.json({
        projects: rows.map((p) => ({
          id: p.id,
          tenantId: p.tenant_id,
          name: p.name,
          env: p.env,
          createdAt: p.created_at,
        })),
      });
    }
    const mineTenants = new Set(
      store.memberships
        .filter((m) => m.user_id === req.user.sub)
        .map((m) => m.tenant_id)
    );
    let list = store.projects.filter((p) => mineTenants.has(p.tenant_id));
    if (tenantId) list = list.filter((p) => p.tenant_id === tenantId);
    res.json({
      projects: list.map((p) => ({
        id: p.id,
        tenantId: p.tenant_id,
        name: p.name,
        env: p.env,
        createdAt: p.created_at,
      })),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const { tenantId, name, env } = req.body || {};
  if (!tenantId || !name) {
    return res.status(400).json({
      error: { code: 'validation', message: 'tenantId and name required' },
    });
  }
  try {
    await assertTenantAccess(req.user.sub, tenantId);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: { code: err.code || 'forbidden', message: err.message },
    });
  }
  const project = {
    id: store.newId('prj'),
    tenant_id: tenantId,
    name,
    env: env || 'dev',
    created_at: new Date().toISOString(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO projects (id, tenant_id, name, env, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [project.id, project.tenant_id, project.name, project.env, project.created_at]
    );
  } else {
    store.projects.push(project);
  }
  res.status(201).json({
    project: {
      id: project.id,
      tenantId: project.tenant_id,
      name: project.name,
      env: project.env,
      createdAt: project.created_at,
    },
  });
});

app.get('/api/instances', authMiddleware, async (req, res) => {
  const { projectId } = req.query;
  try {
    if (projectId) {
      await assertProjectAccess(req.user.sub, projectId);
    }
    if (isMetaReady()) {
      const params = [req.user.sub];
      let q = `
        SELECT i.* FROM instances i
        JOIN projects p ON p.id = i.project_id
        JOIN memberships m ON m.tenant_id = p.tenant_id
        WHERE m.user_id = $1 AND i.status <> 'deleted'`;
      if (projectId) {
        params.push(projectId);
        q += ` AND i.project_id = $2`;
      }
      q += ' ORDER BY i.created_at DESC';
      const { rows } = await getMetaPool().query(q, params);
      return res.json({
        instances: rows.map((i) => mapInstanceRow(i, req)),
      });
    }
    const mineTenants = new Set(
      store.memberships
        .filter((m) => m.user_id === req.user.sub)
        .map((m) => m.tenant_id)
    );
    const mineProjects = new Set(
      store.projects.filter((p) => mineTenants.has(p.tenant_id)).map((p) => p.id)
    );
    let list = store.instances.filter(
      (i) => i.status !== 'deleted' && mineProjects.has(i.project_id)
    );
    if (projectId) list = list.filter((i) => i.project_id === projectId);
    res.json({
      instances: list.map((i) => mapInstanceRow(i, req)),
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

app.post('/api/instances', authMiddleware, async (req, res) => {
  const { projectId, name, plan, region } = req.body || {};
  if (!projectId || !name) {
    return res.status(400).json({
      error: { code: 'validation', message: 'projectId and name required' },
    });
  }
  try {
    await assertProjectAccess(req.user.sub, projectId);
  } catch (err) {
    return res.status(err.status || 403).json({
      error: { code: err.code || 'forbidden', message: err.message },
    });
  }
  const instance = {
    id: store.newId('ins'),
    project_id: projectId,
    name,
    plan: plan || 'free',
    region: region || 'local',
    status: 'pending',
    host: null,
    port: null,
    database_name: null,
    connection_string: null,
    jwt_secret: null,
    rest_url: null,
    created_at: new Date().toISOString(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO instances (id, project_id, name, plan, region, status, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        instance.id,
        instance.project_id,
        instance.name,
        instance.plan,
        instance.region,
        instance.status,
        instance.created_at,
      ]
    );
  } else {
    store.instances.push(instance);
  }
  res.status(201).json({
    instance: mapInstanceRow(instance, req),
  });
});

app.get('/api/instances/:id', authMiddleware, async (req, res) => {
  try {
    const row = await getInstanceForUser(req.user.sub, req.params.id);
    if (!row) {
      return res.status(404).json({
        error: { code: 'not_found', message: 'Instance not found' },
      });
    }
    res.json({ instance: mapInstanceRow(row, req) });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

async function updateInstanceStatus(id, status, extra = {}) {
  if (isMetaReady()) {
    const sets = ['status = $2'];
    const params = [id, status];
    if (extra.paused_at !== undefined) {
      params.push(extra.paused_at);
      sets.push(`paused_at = $${params.length}`);
    }
    if (extra.deleted_at !== undefined) {
      params.push(extra.deleted_at);
      sets.push(`deleted_at = $${params.length}`);
    }
    if (extra.plan !== undefined) {
      params.push(extra.plan);
      sets.push(`plan = $${params.length}`);
    }
    await getMetaPool().query(
      `UPDATE instances SET ${sets.join(', ')} WHERE id = $1`,
      params
    );
  } else {
    const row = store.instances.find((i) => i.id === id);
    if (row) {
      row.status = status;
      Object.assign(row, extra);
    }
  }
}

app.post('/api/instances/:id/pause', authMiddleware, async (req, res) => {
  try {
    const row = await getInstanceForUser(req.user.sub, req.params.id);
    if (!row) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Instance not found' } });
    }
    if (row.status !== 'ready') {
      return res.status(400).json({
        error: { code: 'invalid_state', message: `Cannot pause from status=${row.status}` },
      });
    }
    const result = await provision.pauseInstance({
      database: row.database_name,
      username: row.username,
    });
    await updateInstanceStatus(row.id, 'paused', {
      paused_at: new Date().toISOString(),
    });
    res.json({ success: true, data: { id: row.id, ...result } });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

app.post('/api/instances/:id/resume', authMiddleware, async (req, res) => {
  try {
    const row = await getInstanceForUser(req.user.sub, req.params.id);
    if (!row) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Instance not found' } });
    }
    if (row.status !== 'paused') {
      return res.status(400).json({
        error: { code: 'invalid_state', message: `Cannot resume from status=${row.status}` },
      });
    }
    const result = await provision.resumeInstance({
      database: row.database_name,
      username: row.username,
      password: row.password,
    });
    await updateInstanceStatus(row.id, 'ready', { paused_at: null });
    res.json({ success: true, data: { id: row.id, ...result } });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

app.post('/api/instances/:id/resize', authMiddleware, async (req, res) => {
  try {
    const planId = String(req.body?.planId || req.body?.plan || '').trim();
    if (!planId || !getPackage(planId)) {
      return res.status(400).json({
        error: { code: 'validation', message: 'valid planId required (free|pro|scale)' },
      });
    }
    const row = await getInstanceForUser(req.user.sub, req.params.id);
    if (!row) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Instance not found' } });
    }
    const result = await provision.resizeInstancePlan({
      connectionString: row.connection_string,
      planId,
    });
    await updateInstanceStatus(row.id, row.status === 'paused' ? 'paused' : row.status || 'ready', {
      plan: planId,
    });
    if (isMetaReady()) {
      await getMetaPool().query(`UPDATE instances SET plan = $2 WHERE id = $1`, [
        row.id,
        planId,
      ]);
    } else {
      const s = store.instances.find((i) => i.id === row.id);
      if (s) s.plan = planId;
    }
    res.json({
      success: true,
      data: {
        id: row.id,
        plan: planId,
        ...result,
        note: 'Soft resize — plan/quota labels updated; no cgroup/RAM enforcement on shared host',
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});

app.delete('/api/instances/:id', authMiddleware, async (req, res) => {
  try {
    const hard = String(req.query.hard || req.body?.hard || '') === '1';
    const row = await getInstanceForUser(req.user.sub, req.params.id);
    if (!row) {
      return res.status(404).json({ error: { code: 'not_found', message: 'Instance not found' } });
    }
    await updateInstanceStatus(row.id, 'deleting');
    let dropResult = { dropped: false };
    if (hard) {
      dropResult = await provision.deleteInstanceDatabase({
        database: row.database_name,
        username: row.username,
      });
    }
    await updateInstanceStatus(row.id, 'deleted', {
      deleted_at: new Date().toISOString(),
    });
    res.json({
      success: true,
      data: {
        id: row.id,
        status: 'deleted',
        hard,
        ...dropResult,
        note: hard
          ? 'Database dropped (unless shared demo)'
          : 'Soft-deleted; pass ?hard=1 to DROP DATABASE',
      },
    });
  } catch (err) {
    res.status(err.status || 500).json({
      error: { code: err.code || 'server', message: err.message },
    });
  }
});
app.get('/api/me/memberships', authMiddleware, async (req, res) => {
  try {
    const memberships = await listMemberships(req.user.sub);
    res.json({ success: true, memberships });
  } catch (err) {
    res.status(500).json({ error: { code: 'server', message: err.message } });
  }
});

// Dashboard / connections / AI / integrations (honest stubs where not real)
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
  let totalTables = 0;
  let totalRows = 0;
  let activeConnections = 0;
  try {
    const pool = await resolveTenantPool({
      userId: req.user.sub,
      requireAuth: false,
    });
    if (pool) {
      const t = await pool.query(`
        SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
      `);
      totalTables = t.rows[0].n;
      activeConnections = 1;
    }
  } catch {
    /* no ready instance */
  }
  if (isMetaReady()) {
    try {
      const { rows } = await getMetaPool().query(
        `SELECT COUNT(*)::int AS n FROM instances i
         JOIN projects p ON p.id = i.project_id
         JOIN memberships m ON m.tenant_id = p.tenant_id
         WHERE m.user_id = $1 AND i.status = 'ready'`,
        [req.user.sub]
      );
      activeConnections = rows[0]?.n || 0;
    } catch {
      /* ignore */
    }
  }
  res.json({
    totalTables,
    totalRows,
    activeConnections,
    systemHealth: activeConnections > 0 ? 'ok' : 'degraded',
    recentActivity: [],
    metaDb: isMetaReady(),
    tenantDb: isTenantReady(),
  });
});

app.get('/api/dashboard/widgets', (_req, res) => {
  res.json({
    widgets: [
      {
        id: 1,
        type: 'metric',
        title: 'Meta DB',
        value: isMetaReady() ? 'connected' : 'offline',
      },
      {
        id: 2,
        type: 'metric',
        title: 'Tenant DB',
        value: isTenantReady() ? 'connected' : 'offline',
      },
    ],
  });
});

app.get('/api/connections', authMiddleware, async (req, res) => {
  try {
    const connections = [];
    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT i.* FROM instances i
         JOIN projects p ON p.id = i.project_id
         JOIN memberships m ON m.tenant_id = p.tenant_id
         WHERE m.user_id = $1 AND i.status = 'ready'
         ORDER BY i.created_at DESC`,
        [req.user.sub]
      );
      for (const i of rows) {
        connections.push({
          id: i.id,
          name: i.name,
          type: 'postgresql',
          host: i.host,
          port: i.port,
          database: i.database_name,
          username: i.username,
          status: 'connected',
          connectionString: i.connection_string,
          restUrl: i.rest_url || `${publicApiBase(req)}/api/rest/${i.id}`,
          projectAuthUrl: `${publicApiBase(req)}/api/project-auth/${i.id}`,
        });
      }
    } else {
      const mineTenants = new Set(
        store.memberships
          .filter((m) => m.user_id === req.user.sub)
          .map((m) => m.tenant_id)
      );
      const mineProjects = new Set(
        store.projects.filter((p) => mineTenants.has(p.tenant_id)).map((p) => p.id)
      );
      for (const i of store.instances.filter(
        (x) => x.status === 'ready' && mineProjects.has(x.project_id)
      )) {
        connections.push({
          id: i.id,
          name: i.name,
          type: 'postgresql',
          host: i.host,
          port: i.port,
          database: i.database_name,
          username: i.username,
          status: 'connected',
          connectionString: i.connection_string,
          restUrl: i.rest_url || `${publicApiBase(req)}/api/rest/${i.id}`,
          projectAuthUrl: `${publicApiBase(req)}/api/project-auth/${i.id}`,
        });
      }
    }
    res.json({ connections });
  } catch (err) {
    res.status(500).json({ error: { code: 'server', message: err.message } });
  }
});

app.post('/api/connections', authMiddleware, (req, res) => {
  res.status(501).json({
    success: false,
    error: {
      code: 'not_implemented',
      message: 'Özel bağlantı ekleme henüz yok — paket kiralama ile instance oluşturun',
    },
  });
});

app.delete('/api/connections/:id', authMiddleware, (_req, res) => {
  res.status(501).json({
    success: false,
    error: { code: 'not_implemented', message: 'Connection delete not implemented' },
  });
});

app.post('/api/ai/sql', optionalAuth, (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'ai_unconfigured',
        message: 'OPENAI_API_KEY tanımlı değil',
      },
    });
  }
  res.json({
    sql: 'SELECT * FROM users LIMIT 10',
    explanation: 'OpenAI anahtarı var; tam AI akışı sonraki milestone',
  });
});

app.post('/api/ai/explain', optionalAuth, (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({
      success: false,
      error: {
        code: 'ai_unconfigured',
        message: 'OPENAI_API_KEY tanımlı değil',
      },
    });
  }
  res.json({
    explanation: 'AI explain stub — key present',
    suggestions: [],
  });
});

app.get('/api/ai/snippets', (_req, res) => {
  res.json({
    snippets: [
      {
        id: 1,
        name: 'List tables',
        sql: `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`,
      },
      {
        id: 2,
        name: 'Recent users',
        sql: 'SELECT * FROM users ORDER BY created_at DESC LIMIT 20',
      },
    ],
  });
});

app.get('/api/integrations', (_req, res) => {
  res.json({
    integrations: [],
    message: 'Entegrasyonlar henüz bağlanmadı',
  });
});

app.post('/api/integrations', authMiddleware, (_req, res) => {
  res.status(501).json({
    success: false,
    error: { code: 'not_implemented', message: 'Integrations create not implemented' },
  });
});

setIo(io);

io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '') ||
      socket.handshake.query?.token;
    if (!token) {
      return next(new Error('unauthorized'));
    }
    socket.user = verifyToken(token);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id, 'user=', socket.user?.sub);

  socket.on('subscribe', async (payload, ack) => {
    try {
      const instanceId =
        typeof payload === 'string' ? payload : payload?.instanceId;
      if (!instanceId) {
        if (typeof ack === 'function') ack({ ok: false, error: 'instanceId required' });
        return;
      }
      const row = await getInstanceForUser(socket.user.sub, instanceId);
      if (!row) {
        if (typeof ack === 'function') ack({ ok: false, error: 'forbidden' });
        return;
      }
      socket.join(roomName(instanceId));
      startListenerForInstanceRow(row).catch(() => {});
      socket.emit('realtime_event', {
        id: `sub-${Date.now()}`,
        type: 'connect',
        instanceId,
        timestamp: new Date().toISOString(),
        details: `Subscribed to instance ${instanceId}`,
        severity: 'low',
        source: 'system',
      });
      if (typeof ack === 'function') ack({ ok: true, room: roomName(instanceId) });
    } catch (err) {
      if (typeof ack === 'function') ack({ ok: false, error: err.message });
    }
  });

  socket.on('unsubscribe', (payload) => {
    const instanceId =
      typeof payload === 'string' ? payload : payload?.instanceId;
    if (instanceId) socket.leave(roomName(instanceId));
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    metaDb: isMetaReady(),
    tenantDb: isTenantReady(),
  });
});

async function start() {
  await initDb();
  // Ensure demo password hash is valid bcrypt
  const bcrypt = require('bcryptjs');
  const demo = store.users.get('demo@graphcore.com');
  if (demo) {
    demo.password_hash = bcrypt.hashSync('demo123', 10);
  }

  await warmListeners();

  server.listen(PORT, HOST, () => {
    console.log(`Node control-plane on ${HOST}:${PORT}`);
    console.log(`  metaDb=${isMetaReady()} tenantDb=${isTenantReady()}`);
    console.log(
      `  stripeWebhook=${process.env.STRIPE_WEBHOOK_SECRET ? 'secret-set' : 'dev-fallback'}`
    );
    console.log('  rest=/api/rest/:instanceId/:table  realtime=socket.io');
    console.log(
      `  storage=${require('./lib/storage').status().backend}  payments=${require('./payments')
        .listProviders()
        .map((p) => `${p.id}:${p.configured ? 'on' : 'off'}`)
        .join(',')}`
    );
  });
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
