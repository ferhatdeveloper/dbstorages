const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

const { initDb, isMetaReady, getMetaPool, isTenantReady } = require('./lib/db');
const store = require('./lib/store');
const { authMiddleware, optionalAuth } = require('./lib/auth');
const authRoutes = require('./routes/auth');
const dbRoutes = require('./routes/db');
const { router: billingRoutes, provisionInstanceAfterPayment, updatePaymentStatus } = require('./routes/billing');
const { getProvider } = require('./payments');

const app = express();
const server = http.createServer(app);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const io = socketIo(server, {
  cors: {
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.NODE_PORT || 4000;

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
    try {
      if (!provider.isConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
        // Dev fallback: accept JSON event without signature
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
      res.json({ received: true });
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
app.use('/api/billing', billingRoutes);

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

// Domain: tenants / projects / instances
app.get('/api/tenants', optionalAuth, async (req, res) => {
  try {
    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT t.* FROM tenants t
         LEFT JOIN memberships m ON m.tenant_id = t.id
         WHERE $1::text IS NULL OR m.user_id = $1
         ORDER BY t.created_at`,
        [req.user?.sub || null]
      );
      return res.json({ tenants: rows.map((t) => ({
        id: t.id,
        name: t.name,
        createdAt: t.created_at,
      })) });
    }
    res.json({
      tenants: store.tenants.map((t) => ({
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

app.get('/api/projects', optionalAuth, async (req, res) => {
  const { tenantId } = req.query;
  try {
    if (isMetaReady()) {
      let q = 'SELECT * FROM projects';
      const params = [];
      if (tenantId) {
        params.push(tenantId);
        q += ` WHERE tenant_id = $1`;
      }
      q += ' ORDER BY created_at';
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
    const list = tenantId
      ? store.projects.filter((p) => p.tenant_id === tenantId)
      : store.projects;
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
    res.status(500).json({ error: { code: 'server', message: err.message } });
  }
});

app.post('/api/projects', authMiddleware, async (req, res) => {
  const { tenantId, name, env } = req.body || {};
  if (!tenantId || !name) {
    return res.status(400).json({
      error: { code: 'validation', message: 'tenantId and name required' },
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

app.get('/api/instances', optionalAuth, async (req, res) => {
  const { projectId } = req.query;
  try {
    if (isMetaReady()) {
      let q = 'SELECT * FROM instances WHERE status <> \'deleted\'';
      const params = [];
      if (projectId) {
        params.push(projectId);
        q += ` AND project_id = $1`;
      }
      q += ' ORDER BY created_at DESC';
      const { rows } = await getMetaPool().query(q, params);
      return res.json({
        instances: rows.map((i) => ({
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
          createdAt: i.created_at,
        })),
      });
    }
    const list = projectId
      ? store.instances.filter((i) => i.project_id === projectId)
      : store.instances;
    res.json({
      instances: list.map((i) => ({
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
        createdAt: i.created_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: { code: 'server', message: err.message } });
  }
});

app.post('/api/instances', authMiddleware, async (req, res) => {
  const { projectId, name, plan, region } = req.body || {};
  if (!projectId || !name) {
    return res.status(400).json({
      error: { code: 'validation', message: 'projectId and name required' },
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
    instance: {
      id: instance.id,
      projectId: instance.project_id,
      name: instance.name,
      plan: instance.plan,
      region: instance.region,
      status: instance.status,
      host: null,
      port: null,
      database: null,
      connectionString: null,
      createdAt: instance.created_at,
    },
  });
});

// Dashboard / connections / AI / integrations (honest stubs where not real)
app.get('/api/dashboard/stats', optionalAuth, async (_req, res) => {
  let totalTables = 0;
  let totalRows = 0;
  if (isTenantReady()) {
    try {
      const { getTenantPool } = require('./lib/db');
      const pool = getTenantPool();
      const t = await pool.query(`
        SELECT COUNT(*)::int AS n FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
      `);
      totalTables = t.rows[0].n;
    } catch {
      /* ignore */
    }
  }
  res.json({
    totalTables,
    totalRows,
    activeConnections: isTenantReady() ? 1 : 0,
    systemHealth: isTenantReady() ? 'ok' : 'degraded',
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

app.get('/api/connections', optionalAuth, async (_req, res) => {
  const connections = [];
  if (isTenantReady()) {
    connections.push({
      id: 'tenant_demo',
      name: 'Demo Tenant DB',
      type: 'postgresql',
      host: 'localhost',
      port: 5432,
      database: 'graphcore_demo',
      status: 'connected',
    });
  }
  res.json({ connections });
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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
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

  server.listen(PORT, () => {
    console.log(`Node control-plane on :${PORT}`);
    console.log(`  metaDb=${isMetaReady()} tenantDb=${isTenantReady()}`);
  });
}

start().catch((err) => {
  console.error('Failed to start', err);
  process.exit(1);
});
