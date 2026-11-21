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
  {
    id: 'vps',
    name: 'VPS Kiralama',
    priceCents: 0,
    priceYearCents: 0,
    currency: 'eur',
    interval: 'month',
    billingNote: 'Ayrı ek hizmet — katalog fiyatı (Hetzner × 1.20, EUR)',
    description:
      'Veritabanı planlarından bağımsız VPS / sunucu kiralama. Studio → Cloud Infrastructure: provider, server, volume, firewall, snapshot. Per-plan retail = upstream × 1.20.',
    contactOnly: true,
    studioPath: '/app/cloud/servers',
    catalogPath: '/api/cloud/public-catalog',
    messaging: [
      'Provider: ad, slug, endpoint, API key',
      'Sunucu: name, image, region, size, SSH, cloud-init',
      'Volume attach/detach · Snapshot restore',
      'Firewall · Activity / Jobs',
      'Fiyat: Hetzner list × %20 (EUR, KDV hariç)',
    ],
    stripePriceEnv: 'STRIPE_PRICE_VPS',
    stripePriceYearEnv: 'STRIPE_PRICE_VPS_YEAR',
  },
  {
    id: 'vpn',
    name: 'WireGuard VPN',
    priceCents: 599, // €5.99 per user (peer/seat) / month
    priceYearCents: 7188, // €5.99 × 12 per user / year
    currency: 'eur',
    interval: 'month',
    pricingModel: 'per_user',
    unitLabel: 'kullanıcı',
    billingNote:
      'Kullanıcı başına · EUR €5.99/kullanıcı/ay (aktif peer = 1 kullanıcı; DB ve VPS’ten bağımsız)',
    description:
      'Güvenli erişim: peer config + QR ile WireGuard. Her aktif peer bir faturalandırılabilir kullanıcıdır (€5.99/kullanıcı/ay). Studio → Cloud → VPN.',
    contactOnly: true,
    studioPath: '/cloud/vpn',
    messaging: [
      '€5.99 / kullanıcı / ay — aktif WireGuard peer başına',
      'Örn. 3 kullanıcı × €5.99 = €17.97/ay',
      'Peer oluştur → .conf indir veya QR tara',
      'WireGuard istemcisi ile bağlan → RDP (3389) / SSH',
      'Mock mod: WIREGUARD_ENDPOINT yoksa da config üretilir',
    ],
    stripePriceEnv: 'STRIPE_PRICE_VPN',
    stripePriceYearEnv: 'STRIPE_PRICE_VPN_YEAR',
  },
];

function getVpsCatalog() {
  try {
    return require('../lib/cloud/catalog').getPublicCatalog();
  } catch {
    return null;
  }
}

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
    pricingModel: a.pricingModel || 'flat',
    unitLabel: a.unitLabel || null,
  }));
}

/** Unit × quantity for metered / per-user add-ons. */
function addonAmountCents(addon, quantity = 1, interval = 'month') {
  const q = Math.max(0, Math.floor(Number(quantity) || 0));
  return unitAmountCents(addon, interval) * q;
}

/**
 * Human-readable VPN (or per_user) line: "3 kullanıcı × €5.99 = €17.97/ay"
 */
function formatPerUserBillingLabel(addon, seats = 0, interval = 'month') {
  const q = Math.max(0, Math.floor(Number(seats) || 0));
  const unit = unitAmountCents(addon, interval);
  const total = unit * q;
  const unitEur = (unit / 100).toFixed(2);
  const totalEur = (total / 100).toFixed(2);
  const period = normalizeInterval(interval) === 'year' ? 'yıl' : 'ay';
  const label = addon?.unitLabel || 'kullanıcı';
  return `${q} ${label} × €${unitEur} = €${totalEur}/${period}`;
}

function vpnBillingSummary(seats = 0, interval = 'month') {
  const addon = getAddon('vpn');
  const quantity = Math.max(0, Math.floor(Number(seats) || 0));
  const unitCents = unitAmountCents(addon, interval);
  const totalCents = unitCents * quantity;
  return {
    pricingModel: 'per_user',
    quantity,
    seats: quantity,
    unitPriceCents: unitCents,
    unitPriceYearCents: unitAmountCents(addon, 'year'),
    totalCents,
    currency: addon?.currency || 'eur',
    interval: normalizeInterval(interval),
    label: formatPerUserBillingLabel(addon, quantity, interval),
    unitLabel: addon?.unitLabel || 'kullanıcı',
  };
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

function totalAmountCents(plan, addons = [], interval = 'month', domains = [], vps = []) {
  const planCents = plan ? unitAmountCents(plan, interval) : 0;
  const addonCents = (addons || []).reduce((sum, a) => {
    const qty =
      a.pricingModel === 'per_user'
        ? Math.max(1, Math.floor(Number(a.quantity) || 1))
        : 1;
    return sum + unitAmountCents(a, interval) * qty;
  }, 0);
  const domainCents = (domains || []).reduce(
    (sum, d) => sum + (Number(d.priceCents) || 0),
    0
  );
  const vpsCents = (vps || []).reduce(
    (sum, v) => sum + (Number(v.priceCents) || 0),
    0
  );
  return planCents + addonCents + domainCents + vpsCents;
}

/** Resolve VPS cart lines against public catalog (EUR → cents). */
function resolveVpsLines(rawList = []) {
  const list = Array.isArray(rawList) ? rawList : [];
  if (!list.length) return { lines: [] };
  const catalog = getVpsCatalog();
  const types = catalog?.serverTypes || catalog?.popularPlans || [];
  const byId = new Map(
    types.map((t) => [String(t.id || t.name).toLowerCase(), t])
  );
  const lines = [];
  for (const item of list) {
    const key = String(item?.id || item?.name || '')
      .trim()
      .toLowerCase();
    if (!key) continue;
    const row = byId.get(key);
    const retail =
      row?.priceRetailMonthly != null
        ? Number(row.priceRetailMonthly)
        : Number(item.priceCents) / 100;
    if (!Number.isFinite(retail) || retail < 0) {
      return { lines: [], error: `unknown vps plan: ${key}` };
    }
    const priceCents = Math.round(retail * 100);
    lines.push({
      id: row?.id || row?.name || item.id,
      name: (row?.description || row?.name || item.name || key).toString(),
      priceCents,
      currency: 'eur',
      interval: 'month',
    });
  }
  return { lines };
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
    domains = [],
    vps = [],
    billingInterval = 'month',
  }) {
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const resolvedDomains = Array.isArray(domains) ? domains : [];
    const resolvedVps = Array.isArray(vps) ? vps : [];
    const interval = normalizeInterval(billingInterval);
    const amountCents = totalAmountCents(
      plan,
      resolvedAddons,
      interval,
      resolvedDomains,
      resolvedVps
    );
    const planCents = plan ? Number(plan.priceCents) || 0 : 0;
    const isFreeOnly = amountCents === 0;

    if (!this.isConfigured() || isFreeOnly) {
      return {
        provider: this.name,
        paymentId,
        status: isFreeOnly ? 'succeeded' : 'pending',
        checkoutUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', paymentId),
        mock: !this.isConfigured() && amountCents > 0,
        amountCents,
        billingInterval: interval,
        message: this.isConfigured()
          ? undefined
          : 'STRIPE_SECRET_KEY yok — mock checkout URL döndürüldü',
      };
    }

    const lineItems = [];
    if (plan && planCents > 0) {
      const catalogEnv =
        interval === 'year' ? plan.stripePriceYearEnv : plan.stripePriceEnv;
      const priceId = catalogEnv ? process.env[catalogEnv] : undefined;
      if (priceId) {
        lineItems.push({ price: priceId, quantity: 1 });
      } else {
        lineItems.push({
          price_data: {
            currency: plan.currency || 'usd',
            unit_amount: unitAmountCents(plan, interval),
            recurring: { interval },
            product_data: {
              name: `GraphCore ${plan.name}`,
              description: plan.description,
            },
          },
          quantity: 1,
        });
      }
    }

    for (const addon of resolvedAddons) {
      const addonEnv =
        interval === 'year' ? addon.stripePriceYearEnv : addon.stripePriceEnv;
      const addonPriceId = addonEnv ? process.env[addonEnv] : undefined;
      // per_user add-ons: Stripe quantity = seat/peer count (default 1)
      const qty =
        addon.pricingModel === 'per_user'
          ? Math.max(1, Math.floor(Number(addon.quantity) || 1))
          : 1;
      if (addonPriceId) {
        lineItems.push({ price: addonPriceId, quantity: qty });
      } else {
        lineItems.push({
          price_data: {
            currency: addon.currency || plan.currency,
            unit_amount: unitAmountCents(addon, interval),
            recurring: { interval },
            product_data: {
              name:
                addon.pricingModel === 'per_user'
                  ? `GraphCore ${addon.name} (kullanıcı başına)`
                  : `GraphCore ${addon.name}`,
              description: addon.description,
            },
          },
          quantity: qty,
        });
      }
    }


    for (const dom of resolvedDomains) {
      lineItems.push({
        price_data: {
          currency: (dom.currency || plan?.currency || 'usd').toLowerCase(),
          unit_amount: Number(dom.priceCents) || 0,
          product_data: {
            name: `Domain ${dom.name}`,
            description: `${dom.years || 1} yıl kayıt`,
          },
        },
        quantity: 1,
      });
    }

    for (const v of resolvedVps) {
      lineItems.push({
        price_data: {
          currency: (v.currency || 'eur').toLowerCase(),
          unit_amount: Number(v.priceCents) || 0,
          product_data: {
            name: `VPS ${v.name}`,
            description: 'İlk ay kiralama — provision Cloud panelden',
          },
        },
        quantity: 1,
      });
    }

    const hasRecurring = Boolean(plan && planCents > 0);
    const sessionParams = {
      mode: hasRecurring ? 'subscription' : 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      customer_email: user.email,
      client_reference_id: user.id,
      metadata: {
        planId: plan?.id || 'domains-only',
        userId: user.id,
        paymentId,
        billingInterval: interval,
        addons: resolvedAddons.map((a) => a.id).join(','),
        domains: resolvedDomains.map((d) => d.name).join(','),
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
    domains = [],
    vps = [],
    billingInterval = 'month',
    /** Pre-converted TRY kuruş (from billing FX). */
    chargeAmountCents,
    chargeCurrency = 'TRY',
  }) {
    const paymentId = `pay_iy_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const resolvedDomains = Array.isArray(domains) ? domains : [];
    const resolvedVps = Array.isArray(vps) ? vps : [];
    const interval = normalizeInterval(billingInterval);
    const catalogCents = totalAmountCents(
      plan,
      resolvedAddons,
      interval,
      resolvedDomains,
      resolvedVps
    );
    const amountCents =
      chargeAmountCents != null && Number.isFinite(Number(chargeAmountCents))
        ? Math.max(1, Math.round(Number(chargeAmountCents)))
        : catalogCents;
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=iyzico&paymentId=${paymentId}&mock=1`,
        mock: true,
        amountCents,
        currency: String(chargeCurrency || 'TRY').toLowerCase(),
        billingInterval: interval,
        message:
          'IYZICO_API_KEY / IYZICO_SECRET_KEY yok — sandbox stub checkout',
      };
    }

    const price = (amountCents / 100).toFixed(2);
    const basketId = paymentId;
    const conversationId = paymentId;
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';

    const basketLabel = plan
      ? `GraphCore ${plan.name}${periodLabel}`
      : resolvedDomains.length
        ? `Domain: ${resolvedDomains.map((d) => d.name).join(', ')}`
        : 'GraphCore';
    const basketItems = [
      {
        id: plan?.id || 'domains-only',
        name: basketLabel,
        category1: 'SaaS',
        itemType: 'VIRTUAL',
        price,
      },
    ];

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
      currency: 'try',
      billingInterval: interval,
      mock: false,
      metadata: {
        userId: user.id,
        planId: plan?.id || 'domains-only',
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
    domains = [],
    vps = [],
    billingInterval = 'month',
    chargeAmountCents,
    chargeCurrency = 'TRY',
  }) {
    const paymentId = `pay_pt_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const resolvedDomains = Array.isArray(domains) ? domains : [];
    const resolvedVps = Array.isArray(vps) ? vps : [];
    const interval = normalizeInterval(billingInterval);
    const catalogCents = totalAmountCents(
      plan,
      resolvedAddons,
      interval,
      resolvedDomains,
      resolvedVps
    );
    const amountCents =
      chargeAmountCents != null && Number.isFinite(Number(chargeAmountCents))
        ? Math.max(1, Math.round(Number(chargeAmountCents)))
        : catalogCents;
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=paytr&paymentId=${paymentId}&mock=1`,
        mock: true,
        amountCents,
        currency: String(chargeCurrency || 'TRY').toLowerCase(),
        billingInterval: interval,
        message: 'PAYTR_MERCHANT_* yok — sandbox stub checkout',
      };
    }

    const merchantOid = paymentId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
    const email = user.email || 'buyer@graphcore.local';
    const paymentAmount = String(amountCents); // TRY kuruş
    const userIp = metadata?.clientIp || '85.34.78.112';
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';
    const basketTitle = plan
      ? `GraphCore ${plan.name}${periodLabel}`
      : resolvedDomains.length
        ? `Domain ${resolvedDomains[0].name}`
        : 'GraphCore';
    const basketRows = [
      [basketTitle, (amountCents / 100).toFixed(2), 1],
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
      `${(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')}/pricing?canceled=1`;

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
      currency: 'try',
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
  getVpsCatalog,
  resolveAddons,
  totalAmountCents,
  resolveVpsLines,
  unitAmountCents,
  addonAmountCents,
  formatPerUserBillingLabel,
  vpnBillingSummary,
  normalizeInterval,
  storageQuotaBytes,
  getProvider,
  listProviders,
  StripeProvider,
  IyzicoProvider,
  PayTRProvider,
};
