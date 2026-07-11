import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from '../components/ThemeToggle';

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  priceYearCents?: number;
  currency: string;
  interval: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  storageGb?: number;
  connections: number;
  highlight?: boolean;
  description: string;
  trialDays?: number;
  features?: string[];
  support?: string;
  backupRetentionDays?: number;
};

type Addon = {
  id: string;
  name: string;
  priceCents: number;
  priceYearCents?: number;
  currency: string;
  interval: string;
  description: string;
  billingNote?: string;
};

type Provider = { id: string; configured: boolean };
type BillingInterval = 'month' | 'year';

const FALLBACK_PLANS: Plan[] = [
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
    support: 'community',
    description: '15 gün ücretsiz deneme — yerel Postgres ile başlayın.',
    features: [
      '15 gün deneme',
      '0.5 vCPU · 512 MB RAM',
      '1 GB veritabanı',
      '20 eşzamanlı bağlantı',
      'Topluluk desteği',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3400,
    priceYearCents: 40800,
    currency: 'usd',
    interval: 'month',
    vcpu: 2,
    ramMb: 4096,
    diskGb: 25,
    storageGb: 10,
    connections: 100,
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
  },
  {
    id: 'scale',
    name: 'Scale',
    priceCents: 5000,
    priceYearCents: 60000,
    currency: 'usd',
    interval: 'month',
    vcpu: 4,
    ramMb: 8192,
    diskGb: 80,
    storageGb: 50,
    connections: 400,
    support: 'priority',
    description: 'Büyüyen ekipler için daha fazla CPU, disk ve bağlantı.',
    features: [
      '4 vCPU · 8 GB RAM',
      '80 GB veritabanı diski',
      '50 GB object storage',
      '400 eşzamanlı bağlantı',
      'Öncelikli e-posta desteği',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    priceCents: 9900,
    priceYearCents: 118800,
    currency: 'usd',
    interval: 'month',
    vcpu: 8,
    ramMb: 32768,
    diskGb: 250,
    storageGb: 150,
    connections: 1000,
    support: 'dedicated',
    description: 'En yüksek kaynak ve bağlantı limiti — büyük üretim iş yükleri.',
    features: [
      '8 vCPU · 32 GB RAM',
      '250 GB veritabanı diski',
      '150 GB object storage',
      '1000 eşzamanlı bağlantı',
      'Özel / öncelikli destek',
    ],
  },
];

const FALLBACK_ADDONS: Addon[] = [
  {
    id: 'backup',
    name: 'Yedekleme',
    priceCents: 1000,
    priceYearCents: 12000,
    currency: 'usd',
    interval: 'month',
    billingNote: 'Ay başında faturalandırılır',
    description: 'Otomatik yedekleme — aylık $10 veya yıllık $120.',
  },
];

function planAmount(plan: Plan, interval: BillingInterval) {
  if (!plan.priceCents) return 0;
  // Monthly toggle must never show yearly totals
  if (interval === 'year') {
    return plan.priceYearCents ?? plan.priceCents * 12;
  }
  return plan.priceCents;
}

function addonAmount(addon: Addon, interval: BillingInterval) {
  if (interval === 'year') {
    return addon.priceYearCents ?? addon.priceCents * 12;
  }
  return addon.priceCents;
}

function featureLines(plan: Plan): string[] {
  if (plan.features?.length) return plan.features;
  return [
    `${plan.vcpu} vCPU`,
    plan.ramMb >= 1024
      ? `${plan.ramMb / 1024} GB RAM`
      : `${plan.ramMb} MB RAM`,
    `${plan.diskGb} GB disk`,
    `${plan.connections} bağlantı`,
  ];
}

const PricingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [addons, setAddons] = useState<Addon[]>(FALLBACK_ADDONS);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState(params.get('plan') || 'pro');
  const [backupOn, setBackupOn] = useState(params.get('backup') === '1');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    params.get('interval') === 'year' ? 'year' : 'month'
  );
  const [provider, setProvider] = useState('stripe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canceled] = useState(params.get('canceled') === '1');

  useEffect(() => {
    apiService
      .getPackages()
      .then((res) => {
        if (res.data?.length) {
          const byId = new Map(res.data.map((p: Plan) => [p.id, p]));
          setPlans(
            FALLBACK_PLANS.map((fb) => {
              const api = byId.get(fb.id);
              return {
                ...fb,
                ...api,
                // Canonical monthly/yearly prices — ignore stale API amounts
                priceCents: fb.priceCents,
                priceYearCents: fb.priceYearCents ?? fb.priceCents * 12,
                name: api?.name || fb.name,
                description: api?.description || fb.description,
                features: api?.features?.length ? api.features : fb.features,
                vcpu: api?.vcpu ?? fb.vcpu,
                ramMb: api?.ramMb ?? fb.ramMb,
                diskGb: api?.diskGb ?? fb.diskGb,
                storageGb: api?.storageGb ?? fb.storageGb,
                connections: api?.connections ?? fb.connections,
              };
            })
          );
        }
        if (res.addons?.length) setAddons(res.addons);
        if (res.providers) setProviders(res.providers);
      })
      .catch((e) => setError(e.message));
  }, []);

  const selectedPlan = plans.find((p) => p.id === selected) || plans[0];
  const backupAddon =
    addons.find((a) => a.id === 'backup') || FALLBACK_ADDONS[0];
  const canAddBackup = Boolean(selectedPlan && selectedPlan.priceCents > 0);
  // Trial is always monthly; paid plans follow the Aylık/Yıllık toggle
  const effectiveInterval: BillingInterval =
    selectedPlan?.priceCents === 0 ? 'month' : billingInterval;

  const totalCents = useMemo(() => {
    const base = planAmount(selectedPlan, effectiveInterval);
    const add =
      canAddBackup && backupOn
        ? addonAmount(backupAddon, effectiveInterval)
        : 0;
    return base + add;
  }, [selectedPlan, effectiveInterval, canAddBackup, backupOn, backupAddon]);

  const checkout = async () => {
    setError('');
    if (!isAuthenticated) {
      navigate('/register', {
        state: {
          plan: selected,
          backup: canAddBackup && backupOn,
          interval: effectiveInterval,
          from: '/pricing',
        },
      });
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.checkout({
        planId: selected,
        provider,
        interval: effectiveInterval,
        addons: canAddBackup && backupOn ? ['backup'] : [],
      });
      const data = res.data;
      if (data?.checkoutUrl && !data.mock && data.status === 'pending') {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data?.redirectUrl) {
        navigate(
          data.redirectUrl.replace(/^https?:\/\/[^/]+/, '') ||
            '/billing/success'
        );
        return;
      }
      if (data?.checkoutUrl) {
        const url = new URL(data.checkoutUrl, window.location.origin);
        navigate(url.pathname + url.search);
        return;
      }
      navigate(
        `/billing/success?plan=${selected}&paymentId=${data?.paymentId || ''}`
      );
    } catch (e: any) {
      setError(e.message || 'Ödeme başlatılamadı');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-root pricing-page">
      <div className="landing-grid" aria-hidden />
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-mark" />
          GraphCore
        </Link>
        <nav className="landing-nav-links">
          <Link to="/">Tanıtım</Link>
          <ThemeToggle />
          <Link to="/login">Giriş</Link>
        </nav>
      </header>

      <main className="pricing-main">
        <h1>Paket seçin</h1>
        <p>
          Trial 15 gün ücretsiz. Pro $34 · Scale $50 · Max $99 / ay. Yıllık =
          aylık × 12. Yedekleme add-on $10/ay.
        </p>

        <div className="pricing-interval" role="group" aria-label="Faturalama">
          <button
            type="button"
            className={billingInterval === 'month' ? 'is-active' : undefined}
            onClick={() => setBillingInterval('month')}
          >
            Aylık
          </button>
          <button
            type="button"
            className={billingInterval === 'year' ? 'is-active' : undefined}
            onClick={() => setBillingInterval('year')}
          >
            Yıllık
          </button>
        </div>

        {canceled && (
          <div className="pricing-banner">
            Ödeme iptal edildi. Tekrar deneyebilirsiniz.
          </div>
        )}
        {error && <div className="pricing-error">{error}</div>}

        <div className="landing-plan-grid landing-plan-grid-4">
          {plans.map((plan) => {
            const cardInterval: BillingInterval =
              plan.priceCents === 0 ? 'month' : billingInterval;
            const amount = planAmount(plan, cardInterval);
            const isTrial = plan.priceCents === 0;
            return (
              <button
                key={plan.id}
                type="button"
                className={`landing-plan pricing-select${selected === plan.id ? ' is-selected' : ''}${plan.highlight ? ' is-hot' : ''}`}
                onClick={() => setSelected(plan.id)}
              >
                <h3>{plan.name}</h3>
                <p className="landing-plan-price">
                  {isTrial
                    ? '15 gün ücretsiz'
                    : cardInterval === 'year'
                      ? `$${(amount / 100).toFixed(0)}/yıl`
                      : `$${(amount / 100).toFixed(0)}/ay`}
                </p>
                {!isTrial && cardInterval === 'year' && (
                  <p className="landing-plan-equiv">
                    ${((plan.priceCents || 0) / 100).toFixed(0)}/ay × 12
                  </p>
                )}
                <p className="landing-plan-desc">{plan.description}</p>
                <ul>
                  {featureLines(plan).map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        <label
          className={`pricing-addon${canAddBackup ? '' : ' is-disabled'}`}
        >
          <input
            type="checkbox"
            checked={canAddBackup && backupOn}
            disabled={!canAddBackup}
            onChange={(e) => setBackupOn(e.target.checked)}
          />
          <span>
            <strong>{backupAddon.name}</strong> — $
            {(addonAmount(backupAddon, effectiveInterval) / 100).toFixed(0)}/
            {effectiveInterval === 'year' ? 'yıl' : 'ay'}
            <em>
              {effectiveInterval === 'year'
                ? 'Yıllık faturalama ($10 × 12)'
                : backupAddon.billingNote || 'Ay başında faturalandırılır'}
            </em>
            <small>{backupAddon.description}</small>
          </span>
        </label>

        {canAddBackup && (
          <p className="pricing-total">
            Toplam:{' '}
            <strong>
              ${(totalCents / 100).toFixed(0)}/
              {effectiveInterval === 'year' ? 'yıl' : 'ay'}
            </strong>
            {backupOn ? ' (plan + yedekleme)' : ''}
          </p>
        )}

        <div className="pricing-provider">
          <label htmlFor="provider">Ödeme sağlayıcı</label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {(providers.length
              ? providers
              : [
                  { id: 'stripe', configured: false },
                  { id: 'iyzico', configured: false },
                  { id: 'paytr', configured: false },
                ]
            ).map((p) => (
              <option key={p.id} value={p.id}>
                {p.id}
                {p.configured ? ' (yapılandırıldı)' : ' (sandbox/mock)'}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="landing-btn-primary"
          disabled={loading}
          onClick={checkout}
        >
          {loading
            ? 'İşleniyor…'
            : selectedPlan?.priceCents === 0
              ? '15 günlük denemeyi başlat'
              : effectiveInterval === 'year'
                ? 'Yıllık kirala / Öde'
                : 'Aylık kirala / Öde'}
        </button>
      </main>
    </div>
  );
};

export default PricingPage;
