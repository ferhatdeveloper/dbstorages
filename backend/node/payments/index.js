/**
 * Payment provider abstraction.
 * Stripe: real Checkout Session when STRIPE_SECRET_KEY is set.
 * iyzico: Checkout Form Initialize via iyzipay SDK (sandbox/prod URI).
 * PayTR: get-token iframe API (HMAC) via HTTPS form POST.
 */

const crypto = require('crypto');
const axios = require('axios');

const PACKAGES = [
  {
    id: 'free',
    name: 'Trial',
    priceCents: 0,
    priceYearCents: 0,
    currency: 'usd',
    interval: 'month',
    trialDays: 15,
    vcpu: 0.5,
    ramMb: 512,
    diskGb: 1,
    storageGb: 0.5,
    connections: 20,
    backupRetentionDays: 0,
    support: 'community',
    highlight: false,
    description: '15 gün ücretsiz deneme — yerel Postgres ile başlayın.',
    features: [
      '15 gün deneme',
      '0.5 vCPU · 512 MB RAM',
      '1 GB veritabanı',
      '20 eşzamanlı bağlantı',
      'Topluluk desteği',
    ],
    limits: {
      vcpu: 0.5,
      ramMb: 512,
      diskGb: 1,
      storageGb: 0.5,
      connections: 20,
      backupRetentionDays: 0,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3400,
    priceYearCents: 40800, // $34 × 12
    currency: 'usd',
    interval: 'month',
    vcpu: 2,
    ramMb: 4096,
    diskGb: 25,
    storageGb: 10,
    connections: 100,
    backupRetentionDays: 7,
    support: 'email',
    highlight: true,
    description: 'Üretim yükleri için dengeli kiralama planı.',
    features: [
      '2 vCPU · 4 GB RAM',
      '25 GB veritabanı diski',
      '10 GB object storage',
      '100 eşzamanlı bağlantı',
      'E-posta desteği',
    ],
    limits: {
      vcpu: 2,
      ramMb: 4096,
      diskGb: 25,
      storageGb: 10,
      connections: 100,
      backupRetentionDays: 7,
    },
    stripePriceEnv: 'STRIPE_PRICE_PRO',
    stripePriceYearEnv: 'STRIPE_PRICE_PRO_YEAR',
  },
  {
    id: 'scale',
    name: 'Scale',
    priceCents: 5000,
    priceYearCents: 60000, // $50 × 12
    currency: 'usd',
    interval: 'month',
    vcpu: 4,
    ramMb: 8192,
    diskGb: 80,
    storageGb: 50,
    connections: 400,
    backupRetentionDays: 14,
    support: 'priority',
    highlight: false,
    description: 'Büyüyen ekipler için daha fazla CPU, disk ve bağlantı.',
    features: [
      '4 vCPU · 8 GB RAM',
      '80 GB veritabanı diski',
      '50 GB object storage',
      '400 eşzamanlı bağlantı',
      'Öncelikli e-posta desteği',
    ],
    limits: {
      vcpu: 4,
      ramMb: 8192,
      diskGb: 80,
      storageGb: 50,
      connections: 400,
      backupRetentionDays: 14,
    },
    stripePriceEnv: 'STRIPE_PRICE_SCALE',
    stripePriceYearEnv: 'STRIPE_PRICE_SCALE_YEAR',
  },
  {
    id: 'max',
    name: 'Max',
    priceCents: 9900,
    priceYearCents: 118800, // $99 × 12
    currency: 'usd',
    interval: 'month',
    vcpu: 8,
    ramMb: 32768,
    diskGb: 250,
    storageGb: 150,
    connections: 1000,
    backupRetentionDays: 30,
    support: 'dedicated',
    highlight: false,
    description: 'En yüksek kaynak ve bağlantı limiti — büyük üretim iş yükleri.',
    features: [
      '8 vCPU · 32 GB RAM',
      '250 GB veritabanı diski',
      '150 GB object storage',
      '1000 eşzamanlı bağlantı',
      'Özel / öncelikli destek',
    ],
    limits: {
      vcpu: 8,
      ramMb: 32768,
      diskGb: 250,
      storageGb: 150,
      connections: 1000,
      backupRetentionDays: 30,
    },
    stripePriceEnv: 'STRIPE_PRICE_MAX',
    stripePriceYearEnv: 'STRIPE_PRICE_MAX_YEAR',
  },
];

/** Optional add-ons (billed at month start when monthly). */
const ADDONS = [
  {
    id: 'backup',
    name: 'Yedekleme',
    priceCents: 1000,
    priceYearCents: 12000, // $10 × 12
    currency: 'usd',
    interval: 'month',
    billingNote: 'Ay başında faturalandırılır',
    description:
      'Otomatik yedekleme hizmeti — aylık $10 veya yıllık $120.',
    stripePriceEnv: 'STRIPE_PRICE_BACKUP',
    stripePriceYearEnv: 'STRIPE_PRICE_BACKUP_YEAR',
  },
];

function normalizeInterval(interval) {
  return interval === 'year' || interval === 'annual' ? 'year' : 'month';
}

function unitAmountCents(item, interval = 'month') {
  if (!item) return 0;
  if (!item.priceCents) return 0;
  const iv = normalizeInterval(interval);
  if (iv === 'year') {
    return item.priceYearCents != null
      ? item.priceYearCents
      : item.priceCents * 12;
  }
  return item.priceCents;
}

function getPackages() {
  return PACKAGES.map((p) => ({
    ...p,
    priceMonthCents: p.priceCents,
    priceYearCents:
      p.priceYearCents != null
        ? p.priceYearCents
        : p.priceCents === 0
          ? 0
          : p.priceCents * 12,
    intervals: p.priceCents === 0 ? ['month'] : ['month', 'year'],
  }));
}

function getAddons() {
  return ADDONS.map((a) => ({
    ...a,
    priceMonthCents: a.priceCents,
    priceYearCents:
      a.priceYearCents != null ? a.priceYearCents : a.priceCents * 12,
    intervals: ['month', 'year'],
  }));
}

function getPackage(planId) {
  return PACKAGES.find((p) => p.id === planId) || null;
}

function getAddon(addonId) {
  return ADDONS.find((a) => a.id === addonId) || null;
}

function resolveAddons(addonIds = []) {
  const ids = Array.isArray(addonIds) ? addonIds : [];
  const addons = [];
  for (const id of ids) {
    const addon = getAddon(id);
    if (addon) addons.push(addon);
  }
  return addons;
}

function totalAmountCents(plan, addons = [], interval = 'month') {
  return (
    unitAmountCents(plan, interval) +
    addons.reduce((sum, a) => sum + unitAmountCents(a, interval), 0)
  );
}

/** Storage quota bytes for a plan id (MVP enforcement). */
function storageQuotaBytes(planId) {
  const pkg = getPackage(planId) || getPackage('free');
  const gb = pkg?.storageGb ?? pkg?.diskGb ?? 0.5;
  return Math.floor(Number(gb) * 1024 * 1024 * 1024);
}

/** @typedef {{ provider: string, checkoutUrl?: string, clientSecret?: string, paymentId: string, status: string, mock?: boolean }} CheckoutResult */

class StripeProvider {
  constructor() {
    this.name = 'stripe';
    this.secret = process.env.STRIPE_SECRET_KEY || '';
    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.stripe = null;
    if (this.secret) {
      try {
        const Stripe = require('stripe');
        this.stripe = new Stripe(this.secret);
      } catch (err) {
        console.warn('[payments] stripe package missing:', err.message);
      }
    }
  }

  isConfigured() {
    return Boolean(this.secret && this.stripe);
  }

  async createCheckout({
    plan,
    user,
    successUrl,
    cancelUrl,
    metadata,
    addons = [],
    billingInterval = 'month',
  }) {
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const interval = normalizeInterval(billingInterval);
    const amountCents = totalAmountCents(plan, resolvedAddons, interval);

    if (!this.isConfigured() || plan.priceCents === 0) {
      return {
        provider: this.name,
        paymentId,
        status: plan.priceCents === 0 ? 'succeeded' : 'pending',
        checkoutUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', paymentId),
        mock: !this.isConfigured() && plan.priceCents > 0,
        amountCents,
        billingInterval: interval,
        message: this.isConfigured()
          ? undefined
          : 'STRIPE_SECRET_KEY yok — mock checkout URL döndürüldü',
      };
    }

    const catalogEnv =
      interval === 'year' ? plan.stripePriceYearEnv : plan.stripePriceEnv;
    const priceId = catalogEnv ? process.env[catalogEnv] : undefined;

    const lineItems = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: plan.currency,
              unit_amount: unitAmountCents(plan, interval),
              recurring: { interval },
              product_data: {
                name: `GraphCore ${plan.name}`,
                description: plan.description,
              },
            },
            quantity: 1,
          },
        ];

    for (const addon of resolvedAddons) {
      const addonEnv =
        interval === 'year' ? addon.stripePriceYearEnv : addon.stripePriceEnv;
      const addonPriceId = addonEnv ? process.env[addonEnv] : undefined;
      if (addonPriceId) {
        lineItems.push({ price: addonPriceId, quantity: 1 });
      } else {
        lineItems.push({
          price_data: {
            currency: addon.currency || plan.currency,
            unit_amount: unitAmountCents(addon, interval),
            recurring: { interval },
            product_data: {
              name: `GraphCore ${addon.name}`,
              description: addon.description,
            },
          },
          quantity: 1,
        });
      }
    }

    const sessionParams = {
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        planId: plan.id,
        userId: user.id,
        paymentId,
        billingInterval: interval,
        addons: resolvedAddons.map((a) => a.id).join(','),
        ...metadata,
      },
      line_items: lineItems,
    };

    const session = await this.stripe.checkout.sessions.create(sessionParams);
    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl: session.url,
      externalId: session.id,
      amountCents,
      billingInterval: interval,
    };
  }

  async createPaymentIntent({ plan, user, metadata }) {
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        clientSecret: `mock_secret_${paymentId}`,
        mock: true,
      };
    }
    const intent = await this.stripe.paymentIntents.create({
      amount: plan.priceCents,
      currency: plan.currency,
      receipt_email: user.email,
      metadata: { planId: plan.id, userId: user.id, paymentId, ...metadata },
      automatic_payment_methods: { enabled: true },
    });
    return {
      provider: this.name,
      paymentId,
      status: intent.status,
      clientSecret: intent.client_secret,
      externalId: intent.id,
    };
  }

  constructWebhookEvent(rawBody, signature) {
    if (!this.isConfigured() || !this.webhookSecret) {
      throw new Error('Stripe webhook not configured');
    }
    return this.stripe.webhooks.constructEvent(
      rawBody,
      signature,
      this.webhookSecret
    );
  }
}

function iyzicoPromise(method, request) {
  return new Promise((resolve, reject) => {
    method(request, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

class IyzicoProvider {
  constructor() {
    this.name = 'iyzico';
    this.apiKey = process.env.IYZICO_API_KEY || '';
    this.secretKey = process.env.IYZICO_SECRET_KEY || '';
    this.baseUrl =
      process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
    this.client = null;
    if (this.apiKey && this.secretKey) {
      try {
        const Iyzipay = require('iyzipay');
        this.client = new Iyzipay({
          apiKey: this.apiKey,
          secretKey: this.secretKey,
          uri: this.baseUrl,
        });
      } catch (err) {
        console.warn('[payments] iyzipay package missing:', err.message);
      }
    }
  }

  isConfigured() {
    return Boolean(this.apiKey && this.secretKey && this.client);
  }

  async createCheckout({
    plan,
    user,
    successUrl,
    cancelUrl,
    metadata,
    addons = [],
    billingInterval = 'month',
  }) {
    const paymentId = `pay_iy_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const interval = normalizeInterval(billingInterval);
    const amountCents = totalAmountCents(plan, resolvedAddons, interval);
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=iyzico&paymentId=${paymentId}&mock=1`,
        mock: true,
        amountCents,
        billingInterval: interval,
        message:
          'IYZICO_API_KEY / IYZICO_SECRET_KEY yok — sandbox stub checkout',
      };
    }

    const price = (amountCents / 100).toFixed(2);
    const basketId = paymentId;
    const conversationId = paymentId;
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';

    const basketItems = [
      {
        id: plan.id,
        name: `GraphCore ${plan.name}${periodLabel}`,
        category1: 'SaaS',
        itemType: 'VIRTUAL',
        price: (unitAmountCents(plan, interval) / 100).toFixed(2),
      },
      ...resolvedAddons.map((addon) => ({
        id: addon.id,
        name: `GraphCore ${addon.name}${periodLabel}`,
        category1: 'SaaS',
        itemType: 'VIRTUAL',
        price: (unitAmountCents(addon, interval) / 100).toFixed(2),
      })),
    ];
    // iyzico requires basket item prices to sum to paidPrice
    if (resolvedAddons.length === 0) {
      basketItems[0].price = price;
    }

    const request = {
      locale: 'tr',
      conversationId,
      price,
      paidPrice: price,
      currency: 'TRY',
      basketId,
      paymentGroup: 'PRODUCT',
      callbackUrl: `${(process.env.PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '')}/api/billing/webhook/iyzico`,
      enabledInstallments: [1],
      buyer: {
        id: String(user.id).slice(0, 32),
        name: (user.email || 'Graph').split('@')[0].slice(0, 40) || 'User',
        surname: 'GraphCore',
        gsmNumber: '+905350000000',
        email: user.email || 'buyer@graphcore.local',
        identityNumber: '11111111111',
        registrationAddress: 'GraphCore',
        ip: metadata?.clientIp || '85.34.78.112',
        city: 'Istanbul',
        country: 'Turkey',
      },
      shippingAddress: {
        contactName: user.email || 'GraphCore',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'GraphCore',
      },
      billingAddress: {
        contactName: user.email || 'GraphCore',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'GraphCore',
      },
      basketItems,
    };

    // Attach paymentId into success redirect via conversationId lookup on callback
    const result = await iyzicoPromise(
      this.client.checkoutFormInitialize.create.bind(
        this.client.checkoutFormInitialize
      ),
      request
    );

    if (result.status !== 'success') {
      const msg =
        result.errorMessage || result.errorCode || 'iyzico checkout failed';
      throw new Error(msg);
    }

    const pageUrl =
      result.paymentPageUrl ||
      result.checkoutFormContent ||
      null;

    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl:
        pageUrl ||
        `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=iyzico&paymentId=${paymentId}`,
      externalId: result.token || conversationId,
      token: result.token,
      amountCents,
      billingInterval: interval,
      mock: false,
      metadata: {
        userId: user.id,
        planId: plan.id,
        cancelUrl,
        successUrl,
        ...metadata,
      },
    };
  }

  /** Verify callback token from iyzico checkout form. */
  async retrieveCheckoutForm(token) {
    if (!this.isConfigured()) throw new Error('iyzico not configured');
    return iyzicoPromise(
      this.client.checkoutForm.retrieve.bind(this.client.checkoutForm),
      { locale: 'tr', token }
    );
  }
}

class PayTRProvider {
  constructor() {
    this.name = 'paytr';
    this.merchantId = process.env.PAYTR_MERCHANT_ID || '';
    this.merchantKey = process.env.PAYTR_MERCHANT_KEY || '';
    this.merchantSalt = process.env.PAYTR_MERCHANT_SALT || '';
    this.testMode = process.env.PAYTR_TEST_MODE !== '0' ? '1' : '0';
  }

  isConfigured() {
    return Boolean(this.merchantId && this.merchantKey && this.merchantSalt);
  }

  async createCheckout({
    plan,
    user,
    successUrl,
    cancelUrl,
    metadata,
    addons = [],
    billingInterval = 'month',
  }) {
    const paymentId = `pay_pt_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const interval = normalizeInterval(billingInterval);
    const amountCents = totalAmountCents(plan, resolvedAddons, interval);
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=paytr&paymentId=${paymentId}&mock=1`,
        mock: true,
        amountCents,
        billingInterval: interval,
        message: 'PAYTR_MERCHANT_* yok — sandbox stub checkout',
      };
    }

    const merchantOid = paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
    const email = user.email || 'buyer@graphcore.local';
    const paymentAmount = String(amountCents); // kuruş
    const userIp = metadata?.clientIp || '85.34.78.112';
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';
    const basketRows = [
      [
        `GraphCore ${plan.name}${periodLabel}`,
        (unitAmountCents(plan, interval) / 100).toFixed(2),
        1,
      ],
      ...resolvedAddons.map((addon) => [
        `GraphCore ${addon.name}${periodLabel}`,
        (unitAmountCents(addon, interval) / 100).toFixed(2),
        1,
      ]),
    ];
    const userBasket = Buffer.from(JSON.stringify(basketRows)).toString('base64');
    const noInstallment = '1';
    const maxInstallment = '0';
    const currency = 'TL';
    const testMode = this.testMode;
    const debugOn = process.env.PAYTR_DEBUG === '1' ? '1' : '0';
    const timeoutLimit = '30';
    const lang = 'tr';

    const okUrl =
      successUrl
        .replace('{CHECKOUT_SESSION_ID}', paymentId)
        .replace(/([?&])session_id=\{[^}]+\}/, `$1paymentId=${paymentId}`) +
      (successUrl.includes('paymentId=') ? '' : `${successUrl.includes('?') ? '&' : '?'}paymentId=${paymentId}&provider=paytr`);
    const failUrl =
      cancelUrl ||
      `${(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')}/pricing?canceled=1`;

    const hashStr =
      this.merchantId +
      userIp +
      merchantOid +
      email +
      paymentAmount +
      userBasket +
      noInstallment +
      maxInstallment +
      currency +
      testMode;

    const paytrToken = crypto
      .createHmac('sha256', this.merchantKey)
      .update(hashStr + this.merchantSalt)
      .digest('base64');

    const params = new URLSearchParams({
      merchant_id: this.merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email,
      payment_amount: paymentAmount,
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: debugOn,
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: (user.email || 'GraphCore').slice(0, 60),
      user_address: 'GraphCore',
      user_phone: '05300000000',
      merchant_ok_url: okUrl,
      merchant_fail_url: failUrl,
      timeout_limit: timeoutLimit,
      currency,
      test_mode: testMode,
      lang,
    });

    const { data } = await axios.post(
      'https://www.paytr.com/odeme/api/get-token',
      params.toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 20_000,
      }
    );

    if (!data || data.status !== 'success' || !data.token) {
      throw new Error(
        (data && (data.reason || data.msg)) || 'PayTR get-token failed'
      );
    }

    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl: `https://www.paytr.com/odeme/guvenli/${data.token}`,
      externalId: merchantOid,
      token: data.token,
      amountCents,
      billingInterval: interval,
      mock: false,
      metadata: { userId: user.id, planId: plan.id, ...metadata },
    };
  }

  /** Validate PayTR notification HMAC. */
  verifyNotification(body) {
    const merchantOid = body.merchant_oid;
    const status = body.status;
    const totalAmount = body.total_amount;
    const hash = body.hash;
    const token = crypto
      .createHmac('sha256', this.merchantKey)
      .update(merchantOid + this.merchantSalt + status + totalAmount)
      .digest('base64');
    return token === hash;
  }
}

const providers = {
  stripe: new StripeProvider(),
  iyzico: new IyzicoProvider(),
  paytr: new PayTRProvider(),
};

function getProvider(name = 'stripe') {
  const key = (name || 'stripe').toLowerCase();
  return providers[key] || providers.stripe;
}

function listProviders() {
  return Object.values(providers).map((p) => ({
    id: p.name,
    configured: p.isConfigured(),
  }));
}

module.exports = {
  PACKAGES,
  ADDONS,
  getPackages,
  getAddons,
  getPackage,
  getAddon,
  resolveAddons,
  totalAmountCents,
  unitAmountCents,
  normalizeInterval,
  storageQuotaBytes,
  getProvider,
  listProviders,
  StripeProvider,
  IyzicoProvider,
  PayTRProvider,
};
