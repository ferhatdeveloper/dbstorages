const express = require('express');
const { authMiddleware, optionalAuth } = require('../lib/auth');
const { isMetaReady, getMetaPool, setTenantConnection } = require('../lib/db');
const store = require('../lib/store');
const { provisionOrFallback } = require('../lib/provision');
const { startListenerForInstanceRow } = require('../lib/realtime');
const { ensureDefaultOrgForUser } = require('../lib/rbac');
const fx = require('../lib/fx');
const {
  resolveDomainLines,
  domainsAmountCents,
} = require('../lib/domains');
const {
  getPackages,
  getAddons,
  getPackage,
  resolveAddons,
  totalAmountCents,
  resolveVpsLines,
  normalizeInterval,
  getProvider,
  listProviders,
  isProviderEnabled,
} = require('../payments');

const router = express.Router();

const FRONTEND =
  (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
    .split(',')[0]
    .trim() || 'http://localhost:5173';

const TR_POS = new Set(['iyzico', 'paytr']);

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
    paymentRef: row.payment_ref || row.paymentRef || null,
    createdAt: row.created_at || row.createdAt,
  };
}

async function findInstanceByPayment(paymentId, externalId) {
  if (!paymentId && !externalId) return null;
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM instances
       WHERE ($1::text IS NOT NULL AND payment_ref = $1)
          OR ($2::text IS NOT NULL AND stripe_session_id = $2)
       ORDER BY created_at DESC LIMIT 1`,
      [paymentId || null, externalId || null]
    );
    return rows[0] || null;
  }
  return (
    store.instances
      .slice()
      .reverse()
      .find(
        (i) =>
          (paymentId && i.payment_ref === paymentId) ||
          (externalId && i.stripe_session_id === externalId)
      ) || null
  );
}

async function savePayment(record) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO payments (
        id, user_id, tenant_id, provider, plan_id, amount_cents, currency,
        billing_interval, status, external_id, subscription_external_id, metadata, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13)`,
      [
        record.id,
        record.userId,
        record.tenantId || null,
        record.provider,
        record.planId,
        record.amountCents,
        record.currency,
        record.billingInterval || 'month',
        record.status,
        record.externalId || null,
        record.subscriptionExternalId || null,
        JSON.stringify(record.metadata || {}),
        record.createdAt,
      ]
    );
  } else {
    store.payments.push(record);
  }
}

async function updatePaymentStatus(id, status, externalId, extra = {}) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE payments SET
         status = $2,
         external_id = COALESCE($3, external_id),
         subscription_external_id = COALESCE($4, subscription_external_id)
       WHERE id = $1`,
      [
        id,
        status,
        externalId || null,
        extra.subscriptionExternalId || null,
      ]
    );
  } else {
    const p = store.payments.find((x) => x.id === id);
    if (p) {
      p.status = status;
      if (externalId) p.externalId = externalId;
      if (extra.subscriptionExternalId) {
        p.subscriptionExternalId = extra.subscriptionExternalId;
      }
    }
  }
}

/** Polar / Lemon Squeezy / Stripe: subscription ended → instance `suspended`. */
async function suspendInstancesBySubscription(subscriptionId) {
  if (!subscriptionId) return 0;
  if (isMetaReady()) {
    const { rows: pays } = await getMetaPool().query(
      `SELECT id FROM payments WHERE subscription_external_id = $1 OR external_id = $1`,
      [subscriptionId]
    );
    const ids = pays.map((p) => p.id);
    if (!ids.length) return 0;
    const { rowCount } = await getMetaPool().query(
      `UPDATE instances SET status = 'suspended', paused_at = NOW()
       WHERE payment_ref = ANY($1::text[]) AND deleted_at IS NULL`,
      [ids]
    );
    return rowCount || 0;
  }
  let n = 0;
  for (const p of store.payments) {
    if (
      p.subscriptionExternalId === subscriptionId ||
      p.externalId === subscriptionId
    ) {
      for (const i of store.instances) {
        if (i.payment_ref === p.id && i.status !== 'suspended') {
          i.status = 'suspended';
          n += 1;
        }
      }
    }
  }
  return n;
}



async function fulfillDomainsFromPayment(payment, { mock = false } = {}) {
  if (!payment) return [];
  const meta = payment.metadata || payment.meta || {};
  let domains = meta.domains;
  if (typeof domains === 'string') {
    try {
      domains = JSON.parse(domains);
    } catch {
      domains = [];
    }
  }
  if (!Array.isArray(domains) || !domains.length) return [];
  return fulfillDomainOrders({
    userId: payment.user_id || payment.userId,
    tenantId: payment.tenant_id || payment.tenantId,
    paymentId: payment.id,
    domains,
    mock,
  });
}

async function fulfillDomainOrders({
  userId,
  tenantId,
  paymentId,
  domains,
  mock,
}) {
  const lines = Array.isArray(domains) ? domains : [];
  if (!lines.length) return [];
  const out = [];
  const status = mock ? 'active' : 'pending_fulfillment';
  const now = new Date().toISOString();
  for (const d of lines) {
    const id = store.newId('dom');
    const row = {
      id,
      user_id: userId,
      tenant_id: tenantId || null,
      payment_id: paymentId,
      domain_name: d.name,
      tld: d.tld,
      years: d.years || 1,
      price_cents: d.priceCents,
      currency: d.currency || 'usd',
      status,
      metadata: { mock: Boolean(mock) },
      created_at: now,
    };
    if (isMetaReady()) {
      await getMetaPool().query(
        `INSERT INTO domain_orders (
          id, user_id, tenant_id, payment_id, domain_name, tld, years,
          price_cents, currency, status, metadata, created_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
        ON CONFLICT (id) DO NOTHING`,
        [
          row.id,
          row.user_id,
          row.tenant_id,
          row.payment_id,
          row.domain_name,
          row.tld,
          row.years,
          row.price_cents,
          row.currency,
          row.status,
          JSON.stringify(row.metadata),
          row.created_at,
        ]
      );
    } else {
      store.domainOrders.push(row);
    }
    out.push(row);
  }
  return out;
}

async function provisionInstanceAfterPayment({
  userId,
  planId,
  projectId,
  provider,
  paymentId,
  externalId,
}) {
  const existing = await findInstanceByPayment(paymentId, externalId);
  if (existing) {
    return mapInstance(existing);
  }

  const plan = getPackage(planId) || getPackage('starter');
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

router.get('/packages', async (_req, res) => {
  const fx = require('../lib/fx');
const {
  resolveDomainLines,
  domainsAmountCents,
} = require('../lib/domains');
  let fxPayload;
  try {
    fxPayload = await fx.getRates();
  } catch {
    fxPayload = fx.getRatesSync();
  }
  res.json({
    success: true,
    data: getPackages(),
    addons: getAddons(),
    providers: listProviders(),
    fx: fxPayload,
  });
});

router.get('/providers', (_req, res) => {
  res.json({ success: true, data: listProviders() });
});

router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const {
      planId: rawPlanId,
      provider: providerName = 'polar',
      projectId,
      projectName,
      addons: addonIds = [],
      domains: rawDomains = [],
      vps: rawVps = [],
      interval: rawInterval = 'month',
    } = req.body || {};

    const providerKey = String(providerName || 'polar').toLowerCase();
    const knownProviders = [
      'polar',
      'lemonsqueezy',
      'stripe',
      'iyzico',
      'paytr',
      'crypto',
    ];
    if (!knownProviders.includes(providerKey)) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'unknown payment provider' },
      });
    }
    if (!isProviderEnabled(providerKey)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation',
          message: `payment provider disabled: ${providerKey}`,
        },
      });
    }
    const provider = getProvider(providerKey);
    const billingInterval = normalizeInterval(rawInterval);

    const domainsOnly =
      !rawPlanId ||
      rawPlanId === 'domains-only' ||
      String(rawPlanId).toLowerCase() === 'none';

    let plan = null;
    if (!domainsOnly) {
      plan = getPackage(rawPlanId);
      if (!plan) {
        return res.status(400).json({
          success: false,
          error: { code: 'validation', message: 'unknown planId' },
        });
      }
      if (plan.priceCents === 0 && billingInterval === 'year') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'validation',
            message: 'trial plan is monthly-only (15 days)',
          },
        });
      }
    }

    // Veeam / QNAP backup add-ons can be purchased without a paid DB plan
    const addons = resolveAddons(addonIds);
    const catalogCurrency =
      plan?.currency || addons[0]?.currency || 'usd';
    const { lines: domainLines, error: domainErr } = resolveDomainLines(
      rawDomains,
      catalogCurrency
    );
    if (domainErr) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: domainErr },
      });
    }
    const { lines: vpsLinesRaw, error: vpsErr } = resolveVpsLines(rawVps);
    if (vpsErr) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: vpsErr },
      });
    }
    // Normalize VPS EUR → catalog currency when needed
    let vpsLines = vpsLinesRaw;
    if (vpsLines.length && String(catalogCurrency).toLowerCase() !== 'eur') {
      const ratesPayload = await fx.getRates().catch(() => fx.getRatesSync());
      vpsLines = vpsLinesRaw.map((v) => {
        const converted = fx.convertCents(
          v.priceCents,
          'EUR',
          catalogCurrency,
          ratesPayload.rates
        );
        return {
          ...v,
          priceCents: converted != null ? converted : v.priceCents,
          currency: String(catalogCurrency).toLowerCase(),
          pricedFrom: 'eur',
        };
      });
    }
    if (!plan && !domainLines.length && !vpsLines.length && !addons.length) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation',
          message: 'cart empty: planId, domains, vps or addons required',
        },
      });
    }

    const catalogCents = totalAmountCents(
      plan,
      addons,
      billingInterval,
      domainLines,
      vpsLines
    );

    const org = await ensureDefaultOrgForUser(req.user.sub);
    const tenantId = org?.tenantId || null;
    const resolvedProjectId = projectId || org?.projectId || null;

    const user = {
      id: req.user.sub,
      email: req.user.email,
    };

    // Free / trial plan (no domains / paid addons / vps on this path)
    if (
      plan &&
      plan.priceCents === 0 &&
      !domainLines.length &&
      !vpsLines.length &&
      !addons.length
    ) {
      const paymentId = store.newId('pay');
      await savePayment({
        id: paymentId,
        userId: user.id,
        tenantId,
        provider: provider.name,
        planId: plan.id,
        amountCents: 0,
        currency: catalogCurrency,
        billingInterval: 'month',
        status: 'succeeded',
        createdAt: new Date().toISOString(),
        metadata: {
          projectId: resolvedProjectId,
          projectName,
          trialDays: plan.trialDays || 15,
          billingInterval: 'month',
        },
      });
      const instance = await provisionInstanceAfterPayment({
        userId: user.id,
        planId: plan.id,
        projectId: resolvedProjectId,
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
          redirectUrl: `${FRONTEND}/billing/success?plan=${plan.id}&paymentId=${paymentId}`,
        },
      });
    }

    let chargeAmountCents = catalogCents;
    let chargeCurrency = catalogCurrency;
    let fxMeta = null;
    if (TR_POS.has(provider.name)) {
      const ratesPayload = await fx.getRates().catch(() => fx.getRatesSync());
      const tryCents = fx.convertCents(
        catalogCents,
        catalogCurrency,
        'TRY',
        ratesPayload.rates
      );
      if (tryCents == null || tryCents < 1) {
        return res.status(500).json({
          success: false,
          error: { code: 'fx', message: 'TRY conversion failed' },
        });
      }
      chargeAmountCents = tryCents;
      chargeCurrency = 'try';
      fxMeta = {
        from: catalogCurrency,
        to: 'try',
        catalogCents,
        ratesSource: ratesPayload.source,
        fetchedAt: ratesPayload.fetchedAt,
      };
    }

    const planSlug = plan?.id || 'domains-only';
    const successUrl = `${FRONTEND}/billing/success?session_id={CHECKOUT_SESSION_ID}&plan=${planSlug}&interval=${billingInterval}`;
    const cancelUrl = `${FRONTEND}/cart?canceled=1`;

    const checkoutPlan =
      plan ||
      {
        id: 'domains-only',
        name: 'Domain',
        priceCents: 0,
        currency: catalogCurrency,
        description: 'Domain registration',
      };

    const result = await provider.createCheckout({
      plan: checkoutPlan,
      user,
      successUrl,
      cancelUrl,
      addons: plan ? addons : [],
      domains: domainLines,
      vps: vpsLines,
      billingInterval,
      chargeAmountCents: TR_POS.has(provider.name) ? chargeAmountCents : undefined,
      chargeCurrency: TR_POS.has(provider.name) ? 'TRY' : undefined,
      metadata: {
        projectId: resolvedProjectId || '',
        projectName: projectName || '',
        tenantId: tenantId || '',
        addons: addons.map((a) => a.id).join(','),
        domains: domainLines.map((d) => d.name).join(','),
        domainsJson: JSON.stringify(
          domainLines.map((d) => ({
            name: d.name,
            tld: d.tld,
            years: d.years,
            priceCents: d.priceCents,
          }))
        ),
        vps: vpsLines.map((v) => v.id).join(','),
        vpsJson: JSON.stringify(
          vpsLines.map((v) => ({
            id: v.id,
            name: v.name,
            priceCents: v.priceCents,
          }))
        ),
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
      tenantId,
      provider: result.provider,
      planId: planSlug,
      amountCents: result.amountCents ?? chargeAmountCents,
      currency: result.currency || chargeCurrency,
      billingInterval,
      status: result.status,
      externalId: result.externalId,
      createdAt: new Date().toISOString(),
      metadata: {
        projectId: resolvedProjectId,
        projectName,
        mock: result.mock || false,
        addons: addons.map((a) => a.id),
        domains: domainLines,
        vps: vpsLines,
        billingInterval,
        catalogCents,
        catalogCurrency,
        fx: fxMeta,
      },
    });

    let instance = null;
    let domainOrders = [];
    const shouldFulfillNow =
      (result.mock || result.status === 'succeeded') && !result.deferFulfillment;
    if (shouldFulfillNow) {
      if (plan && plan.id !== 'domains-only') {
        instance = await provisionInstanceAfterPayment({
          userId: user.id,
          planId: plan.id,
          projectId: resolvedProjectId,
          provider: result.provider,
          paymentId: result.paymentId,
          externalId: result.externalId,
        });
      }
      domainOrders = await fulfillDomainOrders({
        userId: user.id,
        tenantId,
        paymentId: result.paymentId,
        domains: domainLines,
        mock: Boolean(result.mock) || result.status === 'succeeded',
      });
      await updatePaymentStatus(result.paymentId, 'succeeded', result.externalId);
    }

    res.json({
      success: true,
      data: {
        ...result,
        instance,
        domainOrders,
        addons: addons.map((a) => a.id),
        domains: domainLines.map((d) => d.name),
        vps: vpsLines.map((v) => v.id),
        amountCents: result.amountCents ?? chargeAmountCents,
        currency: result.currency || chargeCurrency,
        billingInterval,
        checkoutUrl: result.checkoutUrl,
        deferFulfillment: Boolean(result.deferFulfillment),
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

    let domainOrders = [];
    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT * FROM instances
         WHERE stripe_session_id = $1 OR payment_ref = $2
         ORDER BY created_at DESC LIMIT 1`,
        [sessionId || null, paymentId || null]
      );
      if (rows[0]) instance = mapInstance(rows[0]);
      if (paymentId || sessionId) {
        const dom = await getMetaPool().query(
          `SELECT * FROM domain_orders
           WHERE payment_id = $1 OR payment_id = $2
           ORDER BY created_at DESC`,
          [paymentId || null, sessionId || null]
        );
        domainOrders = dom.rows;
      }
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
      domainOrders = (store.domainOrders || []).filter(
        (d) => d.payment_id === paymentId || d.payment_id === sessionId
      );
    }

        res.json({
          success: true,
          data: {
            plan: plan || instance?.plan || null,
            sessionId: sessionId || null,
            paymentId: paymentId || null,
            instance,
            domainOrders,
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

async function fulfillPaidPayment(
  payment,
  { externalId, mock = false, provider: providerOverride, subscriptionExternalId } = {}
) {
  if (!payment) return { ok: false, reason: 'not_found' };
  const paymentId = payment.id;
  const status = payment.status || '';
  if (String(status).toLowerCase() === 'succeeded') {
    return { ok: true, already: true, paymentId };
  }
  const userId = payment.user_id || payment.userId;
  const planId = payment.plan_id || payment.planId || 'domains-only';
  const meta = paymentMeta(payment);
  const providerName =
    providerOverride || payment.provider || 'polar';
  await updatePaymentStatus(
    paymentId,
    'succeeded',
    externalId || payment.external_id || payment.externalId,
    { subscriptionExternalId }
  );
  let instance = null;
  if (planId && planId !== 'domains-only') {
    instance = await provisionInstanceAfterPayment({
      userId,
      planId,
      projectId: meta.projectId || null,
      provider: providerName,
      paymentId,
      externalId: externalId || paymentId,
    });
  }
  await fulfillDomainsFromPayment(payment, { mock });
  return { ok: true, paymentId, instance };
}

async function fulfillCryptoPayment(payment, opts = {}) {
  return fulfillPaidPayment(payment, { ...opts, provider: 'crypto' });
}

/**
 * Polar webhook → fulfill on order.paid / subscription.active;
 * suspend on subscription.canceled / subscription.revoked.
 */
async function handlePolarWebhookEvent(eventType, payload) {
  const type = String(eventType || payload?.type || '').toLowerCase();
  const data = payload?.data || payload;
  const meta = data?.metadata || payload?.metadata || {};
  const paymentId = meta.payment_id || meta.paymentId || null;
  const externalId = String(data?.id || '');
  const subscriptionId =
    type.startsWith('subscription')
      ? externalId
      : String(data?.subscription_id || data?.subscription?.id || '') || null;

  if (
    type === 'subscription.canceled' ||
    type === 'subscription.revoked' ||
    type === 'subscription.past_due'
  ) {
    const n = await suspendInstancesBySubscription(
      subscriptionId || externalId
    );
    return { handled: true, type, suspended: n };
  }

  const paid = new Set([
    'order.paid',
    'checkout.updated', // only when succeeded — checked below
    'subscription.active',
    'subscription.created',
  ]);
  if (!paid.has(type)) {
    return { handled: false, type };
  }
  if (type === 'checkout.updated') {
    const status = String(data?.status || '').toLowerCase();
    if (status !== 'succeeded') {
      return { handled: true, type, skipped: status };
    }
  }

  let payment = paymentId ? await findPayment(paymentId) : null;
  if (!payment && externalId) payment = await findPayment(externalId);
  if (!payment) {
    console.warn('[polar] payment not found', paymentId, externalId);
    return { handled: true, type, missing: true };
  }
  await fulfillPaidPayment(payment, {
    externalId: externalId || paymentId,
    mock: false,
    provider: 'polar',
    subscriptionExternalId: subscriptionId || undefined,
  });
  return { handled: true, type, paymentId: payment.id };
}

/**
 * Lemon Squeezy webhook payload → fulfill order / subscription.
 * Events: order_created, subscription_created, subscription_payment_success,
 * subscription_cancelled / subscription_expired.
 */
async function handleLemonSqueezyWebhookEvent(eventName, payload) {
  const name = String(eventName || '').toLowerCase();
  const data = payload?.data || payload;
  const attrs = data?.attributes || {};
  const meta = payload?.meta || {};
  const custom =
    meta.custom_data ||
    meta.custom ||
    attrs.first_order_item?.custom_data ||
    {};
  const paymentId =
    custom.payment_id ||
    custom.paymentId ||
    attrs.checkout_data?.custom?.payment_id ||
    null;
  const externalId = String(data?.id || attrs.identifier || attrs.order_number || '');
  const subscriptionId =
    name.startsWith('subscription')
      ? String(data?.id || attrs.subscription_id || '')
      : String(attrs.subscription_id || attrs.first_subscription_item?.subscription_id || '') ||
        null;

  if (
    name === 'subscription_cancelled' ||
    name === 'subscription_expired' ||
    name === 'subscription_payment_failed'
  ) {
    const n = await suspendInstancesBySubscription(
      subscriptionId || externalId
    );
    return { handled: true, type: name, suspended: n };
  }

  const paidEvents = new Set([
    'order_created',
    'subscription_created',
    'subscription_payment_success',
  ]);
  if (!paidEvents.has(name)) {
    return { handled: false, type: name };
  }

  // order_created with refunded/failed status — skip
  const status = String(attrs.status || '').toLowerCase();
  if (status === 'failed' || status === 'refunded' || status === 'cancelled') {
    return { handled: true, type: name, skipped: status };
  }

  let payment = paymentId ? await findPayment(paymentId) : null;
  if (!payment && externalId) {
    payment = await findPayment(externalId);
  }
  if (!payment) {
    console.warn('[lemonsqueezy] payment not found', paymentId, externalId);
    return { handled: true, type: name, missing: true };
  }

  await fulfillPaidPayment(payment, {
    externalId: externalId || paymentId,
    mock: false,
    provider: 'lemonsqueezy',
    subscriptionExternalId: subscriptionId || undefined,
  });
  return { handled: true, type: name, paymentId: payment.id };
}

/** Demo / mock: kullanıcı kripto ödemeyi onaylar. */
router.post('/crypto/confirm', authMiddleware, async (req, res) => {
  try {
    const paymentId = String(req.body?.paymentId || '').trim();
    if (!paymentId) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'paymentId required' },
      });
    }
    const payment = await findPayment(paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'payment not found' },
      });
    }
    const userId = payment.user_id || payment.userId;
    if (String(userId) !== String(req.user.sub)) {
      return res.status(403).json({
        success: false,
        error: { code: 'forbidden', message: 'not your payment' },
      });
    }
    const provider = String(payment.provider || '').toLowerCase();
    if (provider !== 'crypto') {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'not a crypto payment' },
      });
    }
    const cryptoProvider = getProvider('crypto');
    // Live NOWPayments: confirm only in mock / when explicitly allowed
    if (cryptoProvider.isConfigured() && process.env.CRYPTO_ALLOW_MANUAL_CONFIRM !== '1') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'validation',
          message: 'Canlı kripto ödemede onay IPN ile gelir',
        },
      });
    }
    const result = await fulfillCryptoPayment(payment, {
      externalId: `manual_${paymentId}`,
      mock: true,
    });
    const planId = payment.plan_id || payment.planId || 'domains-only';
    res.json({
      success: true,
      data: {
        ...result,
        redirectUrl: `${FRONTEND}/billing/success?provider=crypto&paymentId=${encodeURIComponent(paymentId)}&plan=${encodeURIComponent(planId)}`,
      },
    });
  } catch (err) {
    console.error('[crypto] confirm', err.message);
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/crypto/:paymentId', authMiddleware, async (req, res) => {
  try {
    const payment = await findPayment(req.params.paymentId);
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'payment not found' },
      });
    }
    const userId = payment.user_id || payment.userId;
    if (String(userId) !== String(req.user.sub)) {
      return res.status(403).json({
        success: false,
        error: { code: 'forbidden', message: 'not your payment' },
      });
    }
    const meta = paymentMeta(payment);
    res.json({
      success: true,
      data: {
        paymentId: payment.id,
        status: payment.status,
        provider: payment.provider,
        planId: payment.plan_id || payment.planId,
        amountCents: payment.amount_cents || payment.amountCents,
        currency: payment.currency,
        billingInterval: payment.billing_interval || meta.billingInterval,
        mock: Boolean(meta.mock),
        payCurrency:
          process.env.NOWPAYMENTS_PAY_CURRENCY || 'usdttrc20',
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

/** NOWPayments IPN callback. */
router.post('/webhook/crypto', async (req, res) => {
  try {
    const provider = getProvider('crypto');
    const sig =
      req.headers['x-nowpayments-sig'] ||
      req.headers['x-nowpayments-signature'] ||
      '';
    if (!provider.verifyIpn(req.body, sig)) {
      return res.status(400).json({ success: false, error: 'bad signature' });
    }
    const body = req.body || {};
    const paymentId = String(body.order_id || body.orderId || '').trim();
    const status = body.payment_status || body.paymentStatus || body.status;
    if (!paymentId) {
      return res.status(400).json({ success: false, error: 'order_id required' });
    }
    if (!provider.isPaidStatus(status)) {
      return res.json({ success: true, ignored: true, status });
    }
    const payment = await findPayment(paymentId);
    if (!payment) {
      console.warn('[crypto] IPN payment not found', paymentId);
      return res.status(404).json({ success: false, error: 'not found' });
    }
    await fulfillCryptoPayment(payment, {
      externalId: String(body.payment_id || body.invoice_id || body.id || ''),
      mock: false,
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[crypto] webhook', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

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
        `${FRONTEND}/cart?canceled=1&provider=iyzico`
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
      if (planId && planId !== 'domains-only') {
        await provisionInstanceAfterPayment({
          userId,
          planId,
          projectId: meta.projectId || null,
          provider: 'iyzico',
          paymentId,
          externalId: result.paymentId || token,
        });
      }
      await fulfillDomainsFromPayment(payment, { mock: false });
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
      if (planId && planId !== 'domains-only') {
        await provisionInstanceAfterPayment({
          userId,
          planId,
          projectId: meta.projectId || null,
          provider: 'paytr',
          paymentId,
          externalId: merchantOid,
        });
      }
      await fulfillDomainsFromPayment(payRow, { mock: false });
    }
    res.send('OK');
  } catch (err) {
    console.error('[paytr] webhook', err.message);
    res.status(400).send('ERROR');
  }
});

/**
 * Handle Stripe webhook events (verified or dev-unsigned).
 * Idempotent provision + subscription lifecycle.
 */
async function handleStripeWebhookEvent(event) {
  const type = event?.type;
  const obj = event?.data?.object || {};

  if (type === 'checkout.session.completed') {
    const planId = obj.metadata?.planId || 'pro';
    const userId = obj.metadata?.userId || obj.client_reference_id;
    const paymentId = obj.metadata?.paymentId;
    const subscriptionId =
      typeof obj.subscription === 'string'
        ? obj.subscription
        : obj.subscription?.id || null;
    if (userId) {
      if (paymentId) {
        await updatePaymentStatus(paymentId, 'succeeded', obj.id, {
          subscriptionExternalId: subscriptionId,
        });
      }
      if (planId && planId !== 'domains-only') {
        await provisionInstanceAfterPayment({
          userId,
          planId,
          projectId: obj.metadata?.projectId || null,
          provider: 'stripe',
          paymentId: paymentId || obj.id,
          externalId: obj.id,
        });
      }
      if (paymentId) {
        const pay = await findPayment(paymentId);
        await fulfillDomainsFromPayment(pay, { mock: false });
      }
    }
    return { handled: true, type };
  }

  if (type === 'invoice.paid') {
    const subscriptionId =
      typeof obj.subscription === 'string'
        ? obj.subscription
        : obj.subscription?.id || null;
    const paymentId = obj.metadata?.paymentId;
    if (paymentId) {
      await updatePaymentStatus(paymentId, 'succeeded', obj.id, {
        subscriptionExternalId: subscriptionId,
      });
    }
    return { handled: true, type };
  }

  if (type === 'customer.subscription.deleted') {
    const subscriptionId = obj.id;
    const n = await suspendInstancesBySubscription(subscriptionId);
    return { handled: true, type, suspended: n };
  }

  return { handled: false, type };
}

module.exports = {
  router,
  provisionInstanceAfterPayment,
  fulfillDomainOrders,
  fulfillDomainsFromPayment,
  fulfillPaidPayment,
  updatePaymentStatus,
  savePayment,
  handleStripeWebhookEvent,
  handleLemonSqueezyWebhookEvent,
  handlePolarWebhookEvent,
  findInstanceByPayment,
  suspendInstancesBySubscription,
};
