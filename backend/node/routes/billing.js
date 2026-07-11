const express = require('express');
const { authMiddleware, optionalAuth } = require('../lib/auth');
const { isMetaReady, getMetaPool, setTenantConnection } = require('../lib/db');
const store = require('../lib/store');
const { provisionOrFallback } = require('../lib/provision');
const {
  getPackages,
  getPackage,
  getProvider,
  listProviders,
} = require('../payments');

const router = express.Router();

const FRONTEND =
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

function mapInstance(row) {
  return {
    id: row.id,
    projectId: row.project_id || row.projectId,
    name: row.name,
    plan: row.plan,
    region: row.region,
    status: row.status,
    host: row.host,
    port: row.port,
    database: row.database_name || row.database,
    username: row.username,
    connectionString: row.connection_string || row.connectionString,
    paymentProvider: row.payment_provider || row.paymentProvider,
    createdAt: row.created_at || row.createdAt,
  };
}

async function savePayment(record) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO payments (id, user_id, provider, plan_id, amount_cents, currency, status, external_id, metadata, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        record.id,
        record.userId,
        record.provider,
        record.planId,
        record.amountCents,
        record.currency,
        record.status,
        record.externalId || null,
        JSON.stringify(record.metadata || {}),
        record.createdAt,
      ]
    );
  } else {
    store.payments.push(record);
  }
}

async function updatePaymentStatus(id, status, externalId) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE payments SET status = $2, external_id = COALESCE($3, external_id) WHERE id = $1`,
      [id, status, externalId || null]
    );
  } else {
    const p = store.payments.find((x) => x.id === id);
    if (p) {
      p.status = status;
      if (externalId) p.externalId = externalId;
    }
  }
}

async function provisionInstanceAfterPayment({
  userId,
  planId,
  projectId,
  provider,
  paymentId,
  externalId,
}) {
  const plan = getPackage(planId) || getPackage('free');
  const instanceId = store.newId('ins');
  const now = new Date().toISOString();
  const name = `${plan.id}-${instanceId.slice(-6)}`;

  // Shared-server multi-DB: CREATE DATABASE + ROLE (falls back to demo if admin DB down)
  const provisioned = await provisionOrFallback({
    instanceId,
    planId: plan.id,
  });

  const instance = {
    id: instanceId,
    project_id: projectId || 'prj_demo',
    name,
    plan: plan.id,
    region: provisioned.region || 'shared',
    status: provisioned.status || 'ready',
    host: provisioned.host,
    port: provisioned.port,
    database_name: provisioned.database,
    username: provisioned.username,
    password: provisioned.password,
    connection_string: provisioned.connectionString,
    payment_provider: provider,
    payment_ref: paymentId,
    stripe_session_id: externalId || null,
    created_at: now,
  };

  if (isMetaReady()) {
    let pid = projectId;
    if (!pid) {
      const { rows } = await getMetaPool().query(
        `SELECT p.id FROM projects p
         JOIN memberships m ON m.tenant_id = p.tenant_id
         WHERE m.user_id = $1 LIMIT 1`,
        [userId]
      );
      pid = rows[0]?.id;
      if (!pid) {
        const tenantId = store.newId('ten');
        pid = store.newId('prj');
        await getMetaPool().query(
          `INSERT INTO tenants (id, name, owner_user_id, created_at) VALUES ($1,$2,$3,$4)`,
          [tenantId, 'Billing Org', userId, now]
        );
        await getMetaPool().query(
          `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1,$2,'owner')`,
          [userId, tenantId]
        );
        await getMetaPool().query(
          `INSERT INTO projects (id, tenant_id, name, env, created_at) VALUES ($1,$2,$3,'prod',$4)`,
          [pid, tenantId, 'Production', now]
        );
      }
      instance.project_id = pid;
    }

    await getMetaPool().query(
      `INSERT INTO instances (
        id, project_id, name, plan, region, status, host, port, database_name,
        username, password, connection_string, stripe_session_id, payment_provider, payment_ref, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        instance.id,
        instance.project_id,
        instance.name,
        instance.plan,
        instance.region,
        instance.status,
        instance.host,
        instance.port,
        instance.database_name,
        instance.username,
        instance.password,
        instance.connection_string,
        instance.stripe_session_id,
        instance.payment_provider,
        instance.payment_ref,
        instance.created_at,
      ]
    );
  } else {
    if (!projectId) {
      let project = store.projects[0];
      if (!project) {
        const tenantId = store.newId('ten');
        store.tenants.push({
          id: tenantId,
          name: 'Billing Org',
          owner_user_id: userId,
          created_at: now,
        });
        project = {
          id: store.newId('prj'),
          tenant_id: tenantId,
          name: 'Production',
          env: 'prod',
          created_at: now,
        };
        store.projects.push(project);
      }
      instance.project_id = project.id;
    }
    store.instances.push(instance);
  }

  // Wire Studio default tenant pool to the new instance (internal URL)
  const internal =
    provisioned.internalConnectionString || provisioned.connectionString;
  await setTenantConnection(internal);

  return mapInstance(instance);
}

router.get('/packages', (_req, res) => {
  res.json({ success: true, data: getPackages(), providers: listProviders() });
});

router.get('/providers', (_req, res) => {
  res.json({ success: true, data: listProviders() });
});

router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const {
      planId = 'pro',
      provider: providerName = 'stripe',
      projectId,
      projectName,
    } = req.body || {};

    const plan = getPackage(planId);
    if (!plan) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'unknown planId' },
      });
    }

    const provider = getProvider(providerName);
    const successUrl = `${FRONTEND}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.id}`;
    const cancelUrl = `${FRONTEND}/pricing?canceled=1`;

    const user = {
      id: req.user.sub,
      email: req.user.email,
    };

    // Free plan: provision immediately
    if (plan.priceCents === 0) {
      const paymentId = store.newId('pay');
      await savePayment({
        id: paymentId,
        userId: user.id,
        provider: provider.name,
        planId: plan.id,
        amountCents: 0,
        currency: plan.currency,
        status: 'succeeded',
        createdAt: new Date().toISOString(),
        metadata: { projectId, projectName },
      });
      const instance = await provisionInstanceAfterPayment({
        userId: user.id,
        planId: plan.id,
        projectId,
        provider: provider.name,
        paymentId,
      });
      return res.json({
        success: true,
        data: {
          provider: provider.name,
          paymentId,
          status: 'succeeded',
          instance,
          redirectUrl: `${FRONTEND}/billing/success?plan=free&paymentId=${paymentId}`,
        },
      });
    }

    const result = await provider.createCheckout({
      plan,
      user,
      successUrl,
      cancelUrl,
      metadata: { projectId: projectId || '', projectName: projectName || '' },
    });

    await savePayment({
      id: result.paymentId,
      userId: user.id,
      provider: result.provider,
      planId: plan.id,
      amountCents: plan.priceCents,
      currency: plan.currency,
      status: result.status,
      externalId: result.externalId,
      createdAt: new Date().toISOString(),
      metadata: { projectId, projectName, mock: result.mock || false },
    });

    // Mock providers: provision immediately so local flow works
    let instance = null;
    if (result.mock || result.status === 'succeeded') {
      instance = await provisionInstanceAfterPayment({
        userId: user.id,
        planId: plan.id,
        projectId,
        provider: result.provider,
        paymentId: result.paymentId,
        externalId: result.externalId,
      });
      await updatePaymentStatus(result.paymentId, 'succeeded', result.externalId);
    }

    res.json({
      success: true,
      data: {
        ...result,
        instance,
        checkoutUrl: result.checkoutUrl,
      },
    });
  } catch (err) {
    console.error('checkout error', err);
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.post('/payment-intent', authMiddleware, async (req, res) => {
  try {
    const { planId = 'pro' } = req.body || {};
    const plan = getPackage(planId);
    if (!plan || plan.priceCents === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'paid plan required' },
      });
    }
    const provider = getProvider('stripe');
    const result = await provider.createPaymentIntent({
      plan,
      user: { id: req.user.sub, email: req.user.email },
    });
    await savePayment({
      id: result.paymentId,
      userId: req.user.sub,
      provider: 'stripe',
      planId: plan.id,
      amountCents: plan.priceCents,
      currency: plan.currency,
      status: result.status,
      externalId: result.externalId,
      createdAt: new Date().toISOString(),
      metadata: { type: 'payment_intent', mock: result.mock || false },
    });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/success', optionalAuth, async (req, res) => {
  try {
    const { session_id: sessionId, plan, paymentId } = req.query;
    let instance = null;

    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT * FROM instances
         WHERE stripe_session_id = $1 OR payment_ref = $2
         ORDER BY created_at DESC LIMIT 1`,
        [sessionId || null, paymentId || null]
      );
      if (rows[0]) instance = mapInstance(rows[0]);
    } else {
      const found = store.instances
        .slice()
        .reverse()
        .find(
          (i) =>
            i.stripe_session_id === sessionId ||
            i.payment_ref === paymentId ||
            (plan && i.plan === plan)
        );
      if (found) instance = mapInstance(found);
    }

    res.json({
      success: true,
      data: {
        plan: plan || instance?.plan || null,
        sessionId: sessionId || null,
        paymentId: paymentId || null,
        instance,
        connectionString: instance?.connectionString || null,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/history', authMiddleware, async (req, res) => {
  try {
    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [req.user.sub]
      );
      return res.json({ success: true, data: rows });
    }
    const list = store.payments.filter((p) => p.userId === req.user.sub);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

module.exports = {
  router,
  provisionInstanceAfterPayment,
  updatePaymentStatus,
  savePayment,
};
