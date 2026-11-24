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
    id: 'starter',
    name: 'Starter',
    priceCents: 1250, // $12.50 / ay
    priceYearCents: 15000, // $150 / yıl
    currency: 'usd',
    interval: 'month',
    vcpu: 1,
    ramMb: 2048,
    diskGb: 20,
    storageGb: 5,
    connections: 50,
    backupRetentionDays: 3,
    support: 'community',
    highlight: false,
    description: 'Basic başlangıç — küçük projeler ve ilk adımlar.',
    features: [
      '1 vCPU · 2 GB RAM',
      '20 GB veritabanı diski',
      '5 GB object storage',
      '50 eşzamanlı bağlantı',
      '3 gün yedek saklama',
      'Topluluk desteği',
    ],
    limits: {
      vcpu: 1,
      ramMb: 2048,
      diskGb: 20,
      storageGb: 5,
      connections: 50,
      backupRetentionDays: 3,
    },
    stripePriceEnv: 'STRIPE_PRICE_STARTER',
    stripePriceYearEnv: 'STRIPE_PRICE_STARTER_YEAR',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3333, // ≈ $33.33 / ay
    priceYearCents: 40000, // $400 / yıl
    currency: 'usd',
    interval: 'month',
    vcpu: 2,
    ramMb: 4096,
    diskGb: 50,
    storageGb: 20,
    connections: 150,
    backupRetentionDays: 7,
    support: 'email',
    highlight: true,
    description: 'Starter’ın bir üstü — dengeli küçük üretim.',
    features: [
      '2 vCPU · 4 GB RAM',
      '50 GB veritabanı diski',
      '20 GB object storage',
      '150 eşzamanlı bağlantı',
      '7 gün yedek saklama',
      'E-posta desteği',
    ],
    limits: {
      vcpu: 2,
      ramMb: 4096,
      diskGb: 50,
      storageGb: 20,
      connections: 150,
      backupRetentionDays: 7,
    },
    stripePriceEnv: 'STRIPE_PRICE_PRO',
    stripePriceYearEnv: 'STRIPE_PRICE_PRO_YEAR',
  },
  {
    id: 'scale',
    name: 'Scale',
    priceCents: 5000, // $50 / ay
    priceYearCents: 60000, // $600 / yıl
    currency: 'usd',
    interval: 'month',
    vcpu: 4,
    ramMb: 8192,
    diskGb: 120,
    storageGb: 50,
    connections: 400,
    backupRetentionDays: 14,
    support: 'priority',
    highlight: false,
    description: 'Pro’nun bir üstü — büyüyen ekipler ve trafik.',
    features: [
      '4 vCPU · 8 GB RAM',
      '120 GB veritabanı diski',
      '50 GB object storage',
      '400 eşzamanlı bağlantı',
      '14 gün yedek saklama',
      'Öncelikli e-posta desteği',
    ],
    limits: {
      vcpu: 4,
      ramMb: 8192,
      diskGb: 120,
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
    priceCents: 7500, // $75 / ay
    priceYearCents: 90000, // $900 / yıl
    currency: 'usd',
    interval: 'month',
    vcpu: 8,
    ramMb: 24576,
    diskGb: 250,
    storageGb: 120,
    connections: 1000,
    backupRetentionDays: 30,
    support: 'dedicated',
    highlight: false,
    description: 'Scale’in bir üstü — yüksek yük ve daha uzun yedek.',
    features: [
      '8 vCPU · 24 GB RAM',
      '250 GB veritabanı diski',
      '120 GB object storage',
      '1000 eşzamanlı bağlantı',
      '30 gün yedek saklama',
      'Özel / öncelikli destek',
    ],
    limits: {
      vcpu: 8,
      ramMb: 24576,
      diskGb: 250,
      storageGb: 120,
      connections: 1000,
      backupRetentionDays: 30,
    },
    stripePriceEnv: 'STRIPE_PRICE_MAX',
    stripePriceYearEnv: 'STRIPE_PRICE_MAX_YEAR',
  },
  {
    id: 'maxplus',
    name: 'Max+',
    priceCents: 10000, // $100 / ay
    priceYearCents: 120000, // $1,200 / yıl
    currency: 'usd',
    interval: 'month',
    vcpu: 12,
    ramMb: 49152,
    diskGb: 400,
    storageGb: 250,
    connections: 2000,
    backupRetentionDays: 45,
    support: 'dedicated',
    highlight: false,
    description: 'Max’in bir üstü — en geniş disk, storage ve bağlantı.',
    features: [
      '12 vCPU · 48 GB RAM',
      '400 GB veritabanı diski',
      '250 GB object storage',
      '2000 eşzamanlı bağlantı',
      '45 gün yedek saklama',
      'Özel / öncelikli destek',
    ],
    limits: {
      vcpu: 12,
      ramMb: 49152,
      diskGb: 400,
      storageGb: 250,
      connections: 2000,
      backupRetentionDays: 45,
    },
    stripePriceEnv: 'STRIPE_PRICE_MAXPLUS',
    stripePriceYearEnv: 'STRIPE_PRICE_MAXPLUS_YEAR',
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
  {
    id: 'backup-100gb',
    name: 'Backup 100 GB',
    priceCents: 249,
    priceYearCents: 2490,
    currency: 'usd',
    interval: 'month',
    billingNote: 'Veeam Backup · QNAP NAS · S3 object storage',
    description:
      'S3 uyumlu 100 GB. Veeam / QNAP HBS3. Studio → Storage.',
    provider: 'veeam-backup',
    capacityGb: 100,
    studioPath: '/storage',
  },
  {
    id: 'backup-1tb',
    name: 'Backup 1 TB',
    priceCents: 999,
    priceYearCents: 9990,
    currency: 'usd',
    interval: 'month',
    billingNote: 'Veeam Backup · QNAP NAS · S3 object storage',
    description:
      'S3 uyumlu 1 TB. Veeam / QNAP HBS3. Studio → Storage.',
    provider: 'veeam-backup',
    capacityGb: 1024,
    studioPath: '/storage',
    highlight: true,
  },
  {
    id: 'backup-5tb',
    name: 'Backup 5 TB',
    priceCents: 4499,
    priceYearCents: 44990,
    currency: 'usd',
    interval: 'month',
    billingNote: 'Veeam Backup · QNAP NAS · S3 object storage',
    description:
      'S3 uyumlu 5 TB. Veeam / QNAP HBS3. Studio → Storage.',
    provider: 'veeam-backup',
    capacityGb: 5120,
    studioPath: '/storage',
  },
  {
    id: 'backup-10tb',
    name: 'Backup 10 TB',
    priceCents: 8499,
    priceYearCents: 84990,
    currency: 'usd',
    interval: 'month',
    billingNote: 'Veeam Backup · QNAP NAS · S3 object storage',
    description:
      'S3 uyumlu 10 TB. Veeam / QNAP HBS3. Studio → Storage.',
    provider: 'veeam-backup',
    capacityGb: 10240,
    studioPath: '/storage',
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
  const pkg = getPackage(planId) || getPackage('starter');
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
              name: `dbstorages ${plan.name}`,
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
                  ? `dbstorages ${addon.name} (kullanıcı başına)`
                  : `dbstorages ${addon.name}`,
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
      ? `dbstorages ${plan.name}${periodLabel}`
      : resolvedDomains.length
        ? `Domain: ${resolvedDomains.map((d) => d.name).join(', ')}`
        : 'dbstorages';
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
        surname: 'dbstorages',
        gsmNumber: '+905350000000',
        email: user.email || 'buyer@dbstorages.local',
        identityNumber: '11111111111',
        registrationAddress: 'dbstorages',
        ip: metadata?.clientIp || '85.34.78.112',
        city: 'Istanbul',
        country: 'Turkey',
      },
      shippingAddress: {
        contactName: user.email || 'dbstorages',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'dbstorages',
      },
      billingAddress: {
        contactName: user.email || 'dbstorages',
        city: 'Istanbul',
        country: 'Turkey',
        address: 'dbstorages',
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
    const email = user.email || 'buyer@dbstorages.local';
    const paymentAmount = String(amountCents); // TRY kuruş
    const userIp = metadata?.clientIp || '85.34.78.112';
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';
    const basketTitle = plan
      ? `dbstorages ${plan.name}${periodLabel}`
      : resolvedDomains.length
        ? `Domain ${resolvedDomains[0].name}`
        : 'dbstorages';
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
      `${(process.env.FRONTEND_ORIGIN || 'http://localhost:5173').split(',')[0].trim().replace(/\/$/, '')}/database?canceled=1`;

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
      user_name: (user.email || 'dbstorages').slice(0, 60),
      user_address: 'dbstorages',
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

/**
 * Crypto via NOWPayments invoice API.
 * Env: NOWPAYMENTS_API_KEY, optional NOWPAYMENTS_IPN_SECRET, NOWPAYMENTS_PAY_CURRENCY (default usdttrc20).
 * Without API key → mock checkout page (defer fulfillment until confirm).
 */
class CryptoProvider {
  constructor() {
    this.name = 'crypto';
    this.apiKey = process.env.NOWPAYMENTS_API_KEY || '';
    this.ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET || '';
    this.apiBase = (
      process.env.NOWPAYMENTS_API_URL || 'https://api.nowpayments.io/v1'
    ).replace(/\/$/, '');
    this.defaultPayCurrency = (
      process.env.NOWPAYMENTS_PAY_CURRENCY || 'usdttrc20'
    ).toLowerCase();
  }

  isConfigured() {
    return Boolean(this.apiKey);
  }

  frontendOrigin() {
    return (
      (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
        .split(',')[0]
        .trim()
        .replace(/\/$/, '') || 'http://localhost:5173'
    );
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
    chargeCurrency,
  }) {
    const paymentId = `pay_cr_${crypto.randomBytes(8).toString('hex')}`;
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
        : Math.max(1, catalogCents);
    const currency = String(
      chargeCurrency || plan?.currency || 'usd'
    ).toLowerCase();
    const priceAmount = (amountCents / 100).toFixed(2);
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';
    const orderDesc = plan
      ? `dbstorages ${plan.name}${periodLabel}`
      : resolvedDomains.length
        ? `Domain ${resolvedDomains[0].name}`
        : 'dbstorages';

    const success =
      successUrl
        .replace('{CHECKOUT_SESSION_ID}', paymentId)
        .replace(/([?&])session_id=\{[^}]+\}/, `$1paymentId=${paymentId}`) +
      (successUrl.includes('paymentId=')
        ? ''
        : `${successUrl.includes('?') ? '&' : '?'}paymentId=${paymentId}&provider=crypto`);

    if (!this.isConfigured()) {
      const mockUrl = new URL(`${this.frontendOrigin()}/billing/crypto`);
      mockUrl.searchParams.set('paymentId', paymentId);
      mockUrl.searchParams.set('amount', priceAmount);
      mockUrl.searchParams.set('currency', currency);
      mockUrl.searchParams.set('pay', this.defaultPayCurrency);
      mockUrl.searchParams.set('plan', plan?.id || 'domains-only');
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: mockUrl.toString(),
        mock: true,
        deferFulfillment: true,
        amountCents,
        currency,
        billingInterval: interval,
        payCurrency: this.defaultPayCurrency,
        message:
          'NOWPAYMENTS_API_KEY yok — demo kripto ödeme sayfası (onay sonrası provision)',
        metadata: { userId: user?.id, planId: plan?.id, ...metadata },
      };
    }

    const ipnCallbackUrl = `${(
      process.env.PUBLIC_API_URL || 'http://localhost:4001'
    ).replace(/\/$/, '')}/api/billing/webhook/crypto`;

    const body = {
      price_amount: Number(priceAmount),
      price_currency: currency,
      pay_currency: this.defaultPayCurrency,
      order_id: paymentId,
      order_description: orderDesc.slice(0, 200),
      ipn_callback_url: ipnCallbackUrl,
      success_url: success,
      cancel_url: cancelUrl || `${this.frontendOrigin()}/cart?canceled=1`,
    };

    const { data } = await axios.post(`${this.apiBase}/invoice`, body, {
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 25_000,
    });

    const invoiceUrl =
      data?.invoice_url || data?.invoiceUrl || data?.payment_url;
    if (!invoiceUrl) {
      throw new Error(
        data?.message || data?.error || 'NOWPayments invoice failed'
      );
    }

    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl: invoiceUrl,
      externalId: String(data.id || data.invoice_id || data.payment_id || ''),
      amountCents,
      currency,
      billingInterval: interval,
      payCurrency: this.defaultPayCurrency,
      mock: false,
      deferFulfillment: true,
      metadata: { userId: user?.id, planId: plan?.id, ...metadata },
    };
  }

  /** Verify NOWPayments IPN signature (HMAC-SHA512 of sorted JSON). */
  verifyIpn(rawBody, signatureHeader) {
    if (!this.ipnSecret) {
      // Dev: allow without secret when key set but IPN secret unset
      return process.env.NODE_ENV !== 'production';
    }
    if (!signatureHeader || !rawBody) return false;
    const payload =
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
    // Prefer sorted-key canonical JSON as NOWPayments docs
    let sorted;
    try {
      const obj = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      sorted = JSON.stringify(obj, Object.keys(obj).sort());
    } catch {
      sorted = payload;
    }
    const digest = crypto
      .createHmac('sha512', this.ipnSecret)
      .update(sorted)
      .digest('hex');
    return digest === String(signatureHeader).toLowerCase();
  }

  isPaidStatus(status) {
    const s = String(status || '').toLowerCase();
    return (
      s === 'finished' ||
      s === 'confirmed' ||
      s === 'sending' ||
      s === 'paid'
    );
  }
}

/** Cached Polar agent JWT access token (1h). */
let _polarTokenCache = { token: '', expiresAt: 0 };

async function resolvePolarAccessToken() {
  const oat = process.env.POLAR_ACCESS_TOKEN || '';
  if (oat) return oat;
  const now = Date.now();
  if (_polarTokenCache.token && _polarTokenCache.expiresAt > now + 60_000) {
    return _polarTokenCache.token;
  }
  const assertion = process.env.POLAR_AGENT_IDENTITY_ASSERTION || '';
  if (!assertion) return '';
  const { data } = await axios.post(
    'https://api.polar.sh/v1/oauth2/token',
    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 15_000,
    }
  );
  const token = data?.access_token || '';
  const ttlSec = Number(data?.expires_in) || 3600;
  _polarTokenCache = {
    token,
    expiresAt: Date.now() + ttlSec * 1000,
  };
  return token;
}

/**
 * Polar (Merchant of Record) — Checkout Session API + custom amount.
 * Env: POLAR_ACCESS_TOKEN (OAT) or POLAR_AGENT_IDENTITY_ASSERTION,
 * POLAR_PRODUCT_ID_ONCE / _MONTH / _YEAR, POLAR_ORGANIZATION_ID, POLAR_WEBHOOK_SECRET
 * Docs: https://polar.sh/docs/features/checkout/session
 */
class PolarProvider {
  constructor() {
    this.name = 'polar';
    this.apiBase = (
      process.env.POLAR_API_URL || 'https://api.polar.sh/v1'
    ).replace(/\/$/, '');
    this.webhookSecret = process.env.POLAR_WEBHOOK_SECRET || '';
    this.productOnce = String(process.env.POLAR_PRODUCT_ID_ONCE || '').trim();
    this.productMonth = String(process.env.POLAR_PRODUCT_ID_MONTH || '').trim();
    this.productYear = String(process.env.POLAR_PRODUCT_ID_YEAR || '').trim();
    this.orgId = String(process.env.POLAR_ORGANIZATION_ID || '').trim();
  }

  isConfigured() {
    const hasAuth =
      Boolean(process.env.POLAR_ACCESS_TOKEN) ||
      Boolean(process.env.POLAR_AGENT_IDENTITY_ASSERTION);
    const hasProduct =
      Boolean(this.productOnce) ||
      Boolean(this.productMonth) ||
      Boolean(this.productYear);
    return hasAuth && hasProduct;
  }

  resolveProductId({ hasRecurringPlan, interval }) {
    if (hasRecurringPlan) {
      if (interval === 'year' && this.productYear) return this.productYear;
      if (this.productMonth) return this.productMonth;
    }
    return this.productOnce || this.productMonth || this.productYear;
  }

  priceBreakdown(plan, addons, domains, vps, interval) {
    const recurringCents =
      (plan ? unitAmountCents(plan, interval) : 0) +
      (addons || []).reduce((sum, a) => {
        const qty =
          a.pricingModel === 'per_user'
            ? Math.max(1, Math.floor(Number(a.quantity) || 1))
            : 1;
        return sum + unitAmountCents(a, interval) * qty;
      }, 0);
    const oneShotCents =
      (domains || []).reduce((s, d) => s + (Number(d.priceCents) || 0), 0) +
      (vps || []).reduce((s, v) => s + (Number(v.priceCents) || 0), 0);
    return {
      recurringCents,
      oneShotCents,
      totalCents: recurringCents + oneShotCents,
    };
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
  }) {
    const paymentId = `pay_pl_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const resolvedDomains = Array.isArray(domains) ? domains : [];
    const resolvedVps = Array.isArray(vps) ? vps : [];
    const interval = normalizeInterval(billingInterval);
    const planCents = plan ? Number(plan.priceCents) || 0 : 0;
    const hasRecurringPlan = Boolean(plan && planCents > 0);
    const breakdown = this.priceBreakdown(
      plan,
      resolvedAddons,
      resolvedDomains,
      resolvedVps,
      interval
    );
    const amountCents =
      chargeAmountCents != null && Number.isFinite(Number(chargeAmountCents))
        ? Math.max(50, Math.round(Number(chargeAmountCents)))
        : Math.max(50, breakdown.totalCents);
    const currency = String(plan?.currency || 'usd').toLowerCase();

    const success =
      successUrl
        .replace('{CHECKOUT_SESSION_ID}', paymentId)
        .replace(/([?&])session_id=\{[^}]+\}/, `$1paymentId=${paymentId}`) +
      (successUrl.includes('paymentId=')
        ? ''
        : `${successUrl.includes('?') ? '&' : '?'}paymentId=${paymentId}&provider=polar`);

    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${success}${success.includes('?') ? '&' : '?'}mock=1`,
        mock: true,
        amountCents,
        currency,
        billingInterval: interval,
        message:
          'POLAR_ACCESS_TOKEN / ürün ID yok — mock checkout',
        metadata: { userId: user?.id, planId: plan?.id, ...metadata },
      };
    }

    const productId = this.resolveProductId({ hasRecurringPlan, interval });
    // Subscription products: recurring only. One-time product: full cart.
    const useSub = hasRecurringPlan && productId !== this.productOnce;
    const amount = useSub
      ? Math.max(50, breakdown.recurringCents)
      : Math.max(50, amountCents);

    const accessToken = await resolvePolarAccessToken();
    if (!accessToken) {
      throw new Error('Polar access token unavailable');
    }

    const body = {
      products: [productId],
      amount,
      success_url: success,
      return_url: cancelUrl || undefined,
      customer_email: user?.email || undefined,
      external_customer_id: user?.id ? String(user.id) : undefined,
      customer_ip_address: metadata?.clientIp || undefined,
      metadata: {
        payment_id: paymentId,
        user_id: String(user?.id || ''),
        plan_id: String(plan?.id || 'domains-only'),
        billing_interval: interval,
        project_id: String(metadata?.projectId || ''),
        tenant_id: String(metadata?.tenantId || ''),
      },
    };

    const { data } = await axios.post(`${this.apiBase}/checkouts/`, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 25_000,
    });

    const checkoutUrl = data?.url;
    if (!checkoutUrl) {
      throw new Error(data?.detail || data?.error || 'Polar checkout failed');
    }

    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl,
      externalId: String(data.id || ''),
      amountCents: amount,
      currency,
      billingInterval: interval,
      mock: false,
      deferFulfillment: true,
      metadata: {
        userId: user?.id,
        planId: plan?.id,
        cancelUrl,
        useSub,
        oneShotPendingCents: useSub ? breakdown.oneShotCents : 0,
        ...metadata,
      },
    };
  }

  /**
   * Standard Webhooks-style verify (webhook-signature header).
   * Falls back to loose check in non-production when secret unset.
   */
  verifyWebhook(rawBody, headers = {}) {
    if (!this.webhookSecret) {
      return process.env.NODE_ENV !== 'production';
    }
    const signature =
      headers['webhook-signature'] ||
      headers['x-polar-signature'] ||
      headers['polar-signature'] ||
      '';
    if (!signature || rawBody == null) return false;
    const payload =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : JSON.stringify(rawBody);
    // Polar/Standard Webhooks: v1,<base64_hmac>
    const ts =
      headers['webhook-timestamp'] || headers['webhook-timestamp'.toLowerCase()];
    const id = headers['webhook-id'] || headers['webhook-id'.toLowerCase()];
    const signed =
      id && ts ? `${id}.${ts}.${payload}` : payload;
    const digest = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signed)
      .digest('base64');
    const parts = String(signature)
      .split(' ')
      .map((p) => p.replace(/^v1,/, '').trim())
      .filter(Boolean);
    return parts.some((p) => {
      try {
        const a = Buffer.from(digest);
        const b = Buffer.from(p);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
      } catch {
        return false;
      }
    });
  }
}

/**
 * Lemon Squeezy (Merchant of Record) — Checkout API + custom_price.
 * NOTE: Lemon Squeezy closed new signups (2024+). Kept for existing stores.
 * Env: LEMON_SQUEEZY_API_KEY, LEMON_SQUEEZY_STORE_ID, LEMON_SQUEEZY_VARIANT_ID
 * Optional: LEMON_SQUEEZY_VARIANT_ID_SUB (subscription variant), LEMON_SQUEEZY_WEBHOOK_SECRET
 * Docs: https://docs.lemonsqueezy.com/api/checkouts/create-checkout
 */
class LemonSqueezyProvider {
  constructor() {
    this.name = 'lemonsqueezy';
    this.apiKey = process.env.LEMON_SQUEEZY_API_KEY || '';
    this.storeId = String(process.env.LEMON_SQUEEZY_STORE_ID || '').trim();
    this.variantId = String(process.env.LEMON_SQUEEZY_VARIANT_ID || '').trim();
    this.variantIdSub = String(
      process.env.LEMON_SQUEEZY_VARIANT_ID_SUB || ''
    ).trim();
    this.webhookSecret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || '';
    this.apiBase = (
      process.env.LEMON_SQUEEZY_API_URL || 'https://api.lemonsqueezy.com/v1'
    ).replace(/\/$/, '');
  }

  isConfigured() {
    return Boolean(this.apiKey && this.storeId && this.variantId);
  }

  frontendOrigin() {
    return (
      (process.env.FRONTEND_ORIGIN || 'http://localhost:5173')
        .split(',')[0]
        .trim()
        .replace(/\/$/, '') || 'http://localhost:5173'
    );
  }

  resolveVariantId({ hasRecurringPlan }) {
    if (hasRecurringPlan && this.variantIdSub) return this.variantIdSub;
    return this.variantId;
  }

  /**
   * Recurring amount (plan + addons) vs one-shot cart total.
   * Domains/VPS stay in metadata; custom_price uses full cart for one-time
   * variant, or recurring-only when subscription variant is used.
   */
  priceBreakdown(plan, addons, domains, vps, interval) {
    const recurringCents =
      (plan ? unitAmountCents(plan, interval) : 0) +
      (addons || []).reduce((sum, a) => {
        const qty =
          a.pricingModel === 'per_user'
            ? Math.max(1, Math.floor(Number(a.quantity) || 1))
            : 1;
        return sum + unitAmountCents(a, interval) * qty;
      }, 0);
    const oneShotCents =
      (domains || []).reduce((s, d) => s + (Number(d.priceCents) || 0), 0) +
      (vps || []).reduce((s, v) => s + (Number(v.priceCents) || 0), 0);
    return {
      recurringCents,
      oneShotCents,
      totalCents: recurringCents + oneShotCents,
    };
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
  }) {
    const paymentId = `pay_ls_${crypto.randomBytes(8).toString('hex')}`;
    const resolvedAddons = Array.isArray(addons) ? addons : [];
    const resolvedDomains = Array.isArray(domains) ? domains : [];
    const resolvedVps = Array.isArray(vps) ? vps : [];
    const interval = normalizeInterval(billingInterval);
    const planCents = plan ? Number(plan.priceCents) || 0 : 0;
    const hasRecurringPlan = Boolean(plan && planCents > 0);
    const breakdown = this.priceBreakdown(
      plan,
      resolvedAddons,
      resolvedDomains,
      resolvedVps,
      interval
    );
    const amountCents =
      chargeAmountCents != null && Number.isFinite(Number(chargeAmountCents))
        ? Math.max(1, Math.round(Number(chargeAmountCents)))
        : Math.max(1, breakdown.totalCents);
    const currency = String(plan?.currency || 'usd').toLowerCase();
    const periodLabel = interval === 'year' ? ' (yıllık)' : '';
    const productName = plan
      ? `dbstorages ${plan.name}${periodLabel}`
      : resolvedDomains.length
        ? `Domain ${resolvedDomains.map((d) => d.name).join(', ')}`
        : 'dbstorages';

    const success =
      successUrl
        .replace('{CHECKOUT_SESSION_ID}', paymentId)
        .replace(/([?&])session_id=\{[^}]+\}/, `$1paymentId=${paymentId}`) +
      (successUrl.includes('paymentId=')
        ? ''
        : `${successUrl.includes('?') ? '&' : '?'}paymentId=${paymentId}&provider=lemonsqueezy`);

    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${success}${success.includes('?') ? '&' : '?'}mock=1`,
        mock: true,
        amountCents,
        currency,
        billingInterval: interval,
        message:
          'LEMON_SQUEEZY_API_KEY / STORE_ID / VARIANT_ID yok — mock checkout',
        metadata: { userId: user?.id, planId: plan?.id, ...metadata },
      };
    }

    const variantId = this.resolveVariantId({ hasRecurringPlan });
    // Subscription variant: charge recurring only (domains billed separately later).
    // One-time variant: full cart custom_price.
    const useSub = hasRecurringPlan && Boolean(this.variantIdSub);
    const customPrice = useSub
      ? Math.max(1, breakdown.recurringCents)
      : Math.max(1, amountCents);

    const body = {
      data: {
        type: 'checkouts',
        attributes: {
          custom_price: customPrice,
          product_options: {
            name: productName.slice(0, 150),
            description: (
              plan?.description ||
              'dbstorages SaaS checkout'
            ).slice(0, 500),
            redirect_url: success,
            enabled_variants: [Number(variantId) || variantId],
          },
          checkout_options: {
            embed: false,
            media: false,
            logo: true,
          },
          checkout_data: {
            email: user?.email || undefined,
            custom: {
              payment_id: paymentId,
              user_id: String(user?.id || ''),
              plan_id: String(plan?.id || 'domains-only'),
              billing_interval: interval,
              project_id: String(metadata?.projectId || ''),
              tenant_id: String(metadata?.tenantId || ''),
            },
          },
        },
        relationships: {
          store: {
            data: { type: 'stores', id: String(this.storeId) },
          },
          variant: {
            data: { type: 'variants', id: String(variantId) },
          },
        },
      },
    };

    const { data } = await axios.post(`${this.apiBase}/checkouts`, body, {
      headers: {
        Accept: 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 25_000,
    });

    const checkoutUrl =
      data?.data?.attributes?.url ||
      data?.data?.attributes?.checkout_url ||
      null;
    if (!checkoutUrl) {
      throw new Error(
        data?.errors?.[0]?.detail || 'Lemon Squeezy checkout failed'
      );
    }

    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl,
      externalId: String(data?.data?.id || ''),
      amountCents: customPrice,
      currency,
      billingInterval: interval,
      mock: false,
      deferFulfillment: true,
      metadata: {
        userId: user?.id,
        planId: plan?.id,
        cancelUrl,
        useSub,
        oneShotPendingCents: useSub ? breakdown.oneShotCents : 0,
        ...metadata,
      },
    };
  }

  /** Verify X-Signature HMAC-SHA256 hex digest of raw body. */
  verifyWebhook(rawBody, signatureHeader) {
    if (!this.webhookSecret) {
      return process.env.NODE_ENV !== 'production';
    }
    if (!signatureHeader || rawBody == null) return false;
    const payload =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : JSON.stringify(rawBody);
    const digest = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');
    const sig = String(signatureHeader).trim();
    try {
      const a = Buffer.from(digest, 'utf8');
      const b = Buffer.from(sig, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
}

/** Comma-separated ids — default: Stripe + TR POS off; Polar is primary MoR. */
function disabledProviderIds() {
  const raw =
    process.env.PAYMENTS_DISABLED != null
      ? process.env.PAYMENTS_DISABLED
      : 'stripe,iyzico,paytr,lemonsqueezy';
  return new Set(
    String(raw)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isProviderEnabled(name) {
  return !disabledProviderIds().has(String(name || '').toLowerCase());
}

const providers = {
  polar: new PolarProvider(),
  lemonsqueezy: new LemonSqueezyProvider(),
  stripe: new StripeProvider(),
  iyzico: new IyzicoProvider(),
  paytr: new PayTRProvider(),
  crypto: new CryptoProvider(),
};

function getProvider(name = 'polar') {
  const key = (name || 'polar').toLowerCase();
  return providers[key] || providers.polar;
}

function listProviders({ includeDisabled = false } = {}) {
  return Object.values(providers)
    .filter((p) => includeDisabled || isProviderEnabled(p.name))
    .map((p) => ({
      id: p.name,
      configured: p.isConfigured(),
      enabled: isProviderEnabled(p.name),
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
  isProviderEnabled,
  disabledProviderIds,
  StripeProvider,
  IyzicoProvider,
  PayTRProvider,
  CryptoProvider,
  LemonSqueezyProvider,
  PolarProvider,
};
