const express = require('express');
const { authMiddleware, optionalAuth } = require('../lib/auth');
const { isMetaReady, getMetaPool, setTenantConnection } = require('../lib/db');
const store = require('../lib/store');
const { provisionOrFallback } = require('../lib/provision');
const { startListenerForInstanceRow } = require('../lib/realtime');
const {
  getPackages,
  getAddons,
  getPackage,
  resolveAddons,
  totalAmountCents,
  normalizeInterval,
  getProvider,
  listProviders,
} = require('../payments');

const router = express.Router();

const FRONTEND =
  process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

function publicApiBase() {
  return (process.env.PUBLIC_API_URL || `http://localhost:${process.env.NODE_PORT || process.env.PORT || 4000}`).replace(
    /\/$/,
    ''
  );
}

function mapInstance(row) {
  const id = row.id;
  const restUrl =
    row.rest_url || row.restUrl || (id ? `${publicApiBase()}/api/rest/${id}` : null);
  return {
    id,
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
    restUrl,
    jwtSecretConfigured: Boolean(row.jwt_secret || row.jwtSecret),
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

  const restUrl = `${publicApiBase()}/api/rest/${instanceId}`;
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
    jwt_secret: provisioned.jwtSecret || null,
    rest_url: restUrl,
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
        username, password, connection_string, jwt_secret, rest_url,
        stripe_session_id, payment_provider, payment_ref, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
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
        instance.jwt_secret,
        instance.rest_url,
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
        store.memberships.push({
          user_id: userId,
          tenant_id: tenantId,
          role: 'owner',
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

  // Warm per-instance pool only (no process-wide tenant rewire)
  const internal =
    provisioned.internalConnectionString || provisioned.connectionString;
  await setTenantConnection(internal);
  startListenerForInstanceRow(instance).catch(() => {});

  return mapInstance(instance);
}

router.get('/packages', (_req, res) => {
  res.json({
    success: true,
    data: getPackages(),
    addons: getAddons(),
    providers: listProviders(),
  });
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
      addons: addonIds = [],
      interval: rawInterval = 'month',
    } = req.body || {};

    const plan = getPackage(planId);
    if (!plan) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'unknown planId' },
      });
    }

    const billingInterval = normalizeInterval(rawInterval);
    if (plan.priceCents === 0 && billingInterval === 'year') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation',
          message: 'trial plan is monthly-only (15 days)',
        },
      });
    }

    const addons = resolveAddons(addonIds);
    const amountCents = totalAmountCents(plan, addons, billingInterval);

    const provider = getProvider(providerName);
    const successUrl = `${FRONTEND}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${plan.id}&interval=${billingInterval}`;
    const cancelUrl = `${FRONTEND}/pricing?canceled=1`;

    const user = {
      id: req.user.sub,
      email: req.user.email,
    };

    // Free / trial plan: provision immediately (addons ignored on trial)
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
        metadata: {
          projectId,
          projectName,
          trialDays: plan.trialDays || 15,
          billingInterval: 'month',
        },
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
          trialDays: plan.trialDays || 15,
          billingInterval: 'month',
          redirectUrl: `${FRONTEND}/billing/success?plan=free&paymentId=${paymentId}`,
        },
      });
    }

    const result = await provider.createCheckout({
      plan,
      user,
      successUrl,
      cancelUrl,
      addons,
      billingInterval,
      metadata: {
        projectId: projectId || '',
        projectName: projectName || '',
        addons: addons.map((a) => a.id).join(','),
        billingInterval,
        clientIp:
          (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
          req.socket?.remoteAddress ||
          '85.34.78.112',
      },
    });

    await savePayment({
      id: result.paymentId,
      userId: user.id,
      provider: result.provider,
      planId: plan.id,
      amountCents: result.amountCents ?? amountCents,
      currency: plan.currency,
      status: result.status,
      externalId: result.externalId,
      createdAt: new Date().toISOString(),
      metadata: {
        projectId,
        projectName,
        mock: result.mock || false,
        addons: addons.map((a) => a.id),
        billingInterval,
      },
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
        addons: addons.map((a) => a.id),
        amountCents: result.amountCents ?? amountCents,
        billingInterval,
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
            restUrl: instance?.restUrl || null,
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

async function findPayment(paymentId) {
  if (!paymentId) return null;
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM payments WHERE id = $1 OR external_id = $1 LIMIT 1`,
      [paymentId]
    );
    return rows[0] || null;
  }
  return (
    store.payments.find((p) => p.id === paymentId || p.externalId === paymentId) ||
    null
  );
}

function paymentMeta(row) {
  let meta = row?.metadata || {};
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  return meta || {};
}

/** iyzico Checkout Form callback (token POST). */
router.post('/webhook/iyzico', async (req, res) => {
  try {
    const token = req.body?.token;
    if (!token) {
      return res.status(400).send('token required');
    }
    const provider = getProvider('iyzico');
    if (!provider.isConfigured()) {
      return res.status(503).send('iyzico not configured');
    }
    const result = await provider.retrieveCheckoutForm(token);
    if (result.status !== 'success' || result.paymentStatus !== 'SUCCESS') {
      console.warn('[iyzico] callback not success', result.status, result.paymentStatus);
      return res.redirect(
        `${FRONTEND}/pricing?canceled=1&provider=iyzico`
      );
    }
    const paymentId =
      result.basketId || result.conversationId || result.paymentId;
    const payment = await findPayment(paymentId);
    if (payment) {
      const userId = payment.user_id || payment.userId;
      const planId = payment.plan_id || payment.planId || 'pro';
      const meta = paymentMeta(payment);
      await updatePaymentStatus(paymentId, 'succeeded', result.paymentId || token);
      await provisionInstanceAfterPayment({
        userId,
        planId,
        projectId: meta.projectId || null,
        provider: 'iyzico',
        paymentId,
        externalId: result.paymentId || token,
      });
    }
    res.redirect(
      `${FRONTEND}/billing/success?provider=iyzico&paymentId=${encodeURIComponent(paymentId || '')}`
    );
  } catch (err) {
    console.error('[iyzico] webhook', err.message);
    res.status(400).send(`iyzico error: ${err.message}`);
  }
});

/** PayTR server-to-server notification (must respond "OK"). */
router.post('/webhook/paytr', async (req, res) => {
  try {
    const provider = getProvider('paytr');
    if (!provider.isConfigured()) {
      return res.status(503).send('paytr not configured');
    }
    if (!provider.verifyNotification(req.body || {})) {
      return res.status(400).send('bad hash');
    }
    const merchantOid = req.body.merchant_oid;
    const status = req.body.status;
    if (status !== 'success') {
      if (merchantOid) await updatePaymentStatus(merchantOid, 'failed', merchantOid);
      return res.send('OK');
    }
    const payment =
      (await findPayment(merchantOid)) ||
      (await findPayment(`pay_pt_${merchantOid}`));
    // merchant_oid was sanitized paymentId
    let payRow = payment;
    if (!payRow && isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT * FROM payments WHERE id LIKE $1 OR external_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [`%${merchantOid}%`, merchantOid]
      );
      payRow = rows[0] || null;
    }
    if (payRow) {
      const paymentId = payRow.id;
      const userId = payRow.user_id || payRow.userId;
      const planId = payRow.plan_id || payRow.planId || 'pro';
      const meta = paymentMeta(payRow);
      await updatePaymentStatus(paymentId, 'succeeded', merchantOid);
      await provisionInstanceAfterPayment({
        userId,
        planId,
        projectId: meta.projectId || null,
        provider: 'paytr',
        paymentId,
        externalId: merchantOid,
      });
    }
    res.send('OK');
  } catch (err) {
    console.error('[paytr] webhook', err.message);
    res.status(400).send('ERROR');
  }
});

module.exports = {
  router,
  provisionInstanceAfterPayment,
  updatePaymentStatus,
  savePayment,
};
