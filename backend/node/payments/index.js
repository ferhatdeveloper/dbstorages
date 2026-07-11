/**
 * Payment provider abstraction.
 * Stripe: real Checkout Session when STRIPE_SECRET_KEY is set.
 * iyzico / PayTR: sandbox-ready stubs with env-based config.
 */

const crypto = require('crypto');

const PACKAGES = [
  {
    id: 'free',
    name: 'Free',
    priceCents: 0,
    currency: 'usd',
    interval: 'month',
    vcpu: 0.5,
    ramMb: 512,
    diskGb: 1,
    connections: 20,
    highlight: false,
    description: 'Geliştirme ve deneme için yerel Postgres.',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 2900,
    currency: 'usd',
    interval: 'month',
    vcpu: 2,
    ramMb: 4096,
    diskGb: 20,
    connections: 100,
    highlight: true,
    description: 'Üretim yükleri için dengeli kiralama planı.',
    stripePriceEnv: 'STRIPE_PRICE_PRO',
  },
  {
    id: 'scale',
    name: 'Scale',
    priceCents: 9900,
    currency: 'usd',
    interval: 'month',
    vcpu: 4,
    ramMb: 16384,
    diskGb: 100,
    connections: 500,
    highlight: false,
    description: 'Yüksek bağlantı ve disk ihtiyacı olan ekipler.',
    stripePriceEnv: 'STRIPE_PRICE_SCALE',
  },
];

function getPackages() {
  return PACKAGES;
}

function getPackage(planId) {
  return PACKAGES.find((p) => p.id === planId) || null;
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
        // lazy require so app boots without stripe installed in edge cases
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

  async createCheckout({ plan, user, successUrl, cancelUrl, metadata }) {
    const paymentId = `pay_${crypto.randomBytes(8).toString('hex')}`;

    if (!this.isConfigured() || plan.priceCents === 0) {
      return {
        provider: this.name,
        paymentId,
        status: plan.priceCents === 0 ? 'succeeded' : 'pending',
        checkoutUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', paymentId),
        mock: !this.isConfigured() && plan.priceCents > 0,
        message: this.isConfigured()
          ? undefined
          : 'STRIPE_SECRET_KEY yok — mock checkout URL döndürüldü',
      };
    }

    const priceId = plan.stripePriceEnv
      ? process.env[plan.stripePriceEnv]
      : undefined;

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
        ...metadata,
      },
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              price_data: {
                currency: plan.currency,
                unit_amount: plan.priceCents,
                recurring: { interval: plan.interval || 'month' },
                product_data: {
                  name: `GraphCore ${plan.name}`,
                  description: plan.description,
                },
              },
              quantity: 1,
            },
          ],
    };

    const session = await this.stripe.checkout.sessions.create(sessionParams);
    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl: session.url,
      externalId: session.id,
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

class IyzicoProvider {
  constructor() {
    this.name = 'iyzico';
    this.apiKey = process.env.IYZICO_API_KEY || '';
    this.secretKey = process.env.IYZICO_SECRET_KEY || '';
    this.baseUrl =
      process.env.IYZICO_BASE_URL || 'https://sandbox-api.iyzipay.com';
  }

  isConfigured() {
    return Boolean(this.apiKey && this.secretKey);
  }

  async createCheckout({ plan, user, successUrl, cancelUrl, metadata }) {
    const paymentId = `pay_iy_${crypto.randomBytes(8).toString('hex')}`;
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=iyzico&paymentId=${paymentId}&mock=1`,
        mock: true,
        message:
          'IYZICO_API_KEY / IYZICO_SECRET_KEY yok — sandbox stub checkout',
      };
    }

    // STUB (sandbox env hazır): iyzipay Checkout Form Initialize henüz wired değil.
    // Keys set olsa bile gerçek HTTP çağrısı yok — Dokploy yolunu bloklamaz.
    // Sonraki adım: iyzipay npm SDK ile /payment/iyzico/checkoutform/initialize
    console.warn(
      '[payments:iyzico] configured but SDK wire pending — returning stub checkout URL'
    );
    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=iyzico&paymentId=${paymentId}&stub=1`,
      externalId: paymentId,
      mock: true,
      metadata: { userId: user.id, planId: plan.id, cancelUrl, ...metadata },
      note: 'STUB: set IYZICO_* for future SDK; real Checkout Form not called yet',
    };
  }
}

class PayTRProvider {
  constructor() {
    this.name = 'paytr';
    this.merchantId = process.env.PAYTR_MERCHANT_ID || '';
    this.merchantKey = process.env.PAYTR_MERCHANT_KEY || '';
    this.merchantSalt = process.env.PAYTR_MERCHANT_SALT || '';
  }

  isConfigured() {
    return Boolean(this.merchantId && this.merchantKey && this.merchantSalt);
  }

  async createCheckout({ plan, user, successUrl, metadata }) {
    const paymentId = `pay_pt_${crypto.randomBytes(8).toString('hex')}`;
    if (!this.isConfigured()) {
      return {
        provider: this.name,
        paymentId,
        status: 'pending',
        checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=paytr&paymentId=${paymentId}&mock=1`,
        mock: true,
        message: 'PAYTR_MERCHANT_* yok — sandbox stub checkout',
      };
    }

    // STUB: merchant credentials present but get-token iframe API not wired yet.
    const tokenHint = crypto
      .createHmac('sha256', this.merchantKey)
      .update(`${this.merchantId}${paymentId}${this.merchantSalt}`)
      .digest('base64');

    console.warn(
      '[payments:paytr] configured but get-token wire pending — returning stub checkout URL'
    );
    return {
      provider: this.name,
      paymentId,
      status: 'pending',
      checkoutUrl: `${successUrl}${successUrl.includes('?') ? '&' : '?'}provider=paytr&paymentId=${paymentId}&stub=1`,
      externalId: paymentId,
      tokenHint,
      mock: true,
      metadata: { userId: user.id, planId: plan.id, ...metadata },
      note: 'STUB: PAYTR_* set; real iframe token API not called yet',
    };
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
  getPackages,
  getPackage,
  getProvider,
  listProviders,
  StripeProvider,
  IyzicoProvider,
  PayTRProvider,
};
