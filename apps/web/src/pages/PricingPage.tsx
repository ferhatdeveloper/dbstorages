import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiService, useAuth, useCurrency, CONSOLE_URL, serverTypeShortSpecs, VPS_POPULAR_FALLBACK, type VpsServerType } from '@graphcore/shared';
import MarketingShell from '../components/MarketingShell';
import { useCart } from '../context/CartContext';
import { localDomainSuggest } from '../lib/domainSuggestLocal';

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
  contactOnly?: boolean;
  studioPath?: string;
  pricingModel?: 'flat' | 'per_user';
  unitLabel?: string;
  messaging?: string[];
};

type BillingInterval = 'month' | 'year';

type PayProvider = {
  id: string;
  configured: boolean;
};

const PAY_PROVIDER_LABELS: Record<string, string> = {
  stripe: 'Kart (Stripe)',
  iyzico: 'iyzico',
  paytr: 'PayTR',
};

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
    description: '15 gün ücretsiz deneme — yerel Database ile başlayın.',
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
    description: 'Otomatik yedekleme — Database paketininize ekleyin.',
  },
  {
    id: 'vps',
    name: 'Cloud / VPS',
    priceCents: 0,
    priceYearCents: 0,
    currency: 'usd',
    interval: 'month',
    billingNote: 'Database paketinden ayrı',
    description:
      'Cloud sunucu kiralama. Region, image ve SSH — panelden dakikalar içinde açın.',
    contactOnly: true,
    studioPath: `${CONSOLE_URL}/cloud/servers`,
  },
  {
    id: 'vpn',
    name: 'WireGuard VPN',
    priceCents: 599,
    priceYearCents: 7188,
    currency: 'eur',
    interval: 'month',
    pricingModel: 'per_user',
    unitLabel: 'kullanıcı',
    billingNote: 'Kullanıcı başına',
    description:
      'Güvenli uzaktan erişim. Peer config veya QR ile bağlanın.',
    contactOnly: true,
    studioPath: `${CONSOLE_URL}/cloud/vpn`,
    messaging: [
      'Aktif peer başına faturalandırılır',
      'Config indir veya QR tara',
      'RDP / SSH için güvenli tünel',
    ],
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
  const { addItem, addDatabasePlan } = useCart();
  const [cartToast, setCartToast] = useState('');
  const { formatCents, formatAmount, fxHint } = useCurrency();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [addons, setAddons] = useState<Addon[]>(FALLBACK_ADDONS);
  const [selected, setSelected] = useState(params.get('plan') || 'pro');
  const [backupOn, setBackupOn] = useState(params.get('backup') === '1');
  const [billingInterval, setBillingInterval] = useState<BillingInterval>(
    params.get('interval') === 'year' ? 'year' : 'month'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canceled] = useState(params.get('canceled') === '1');
  const [vpsPlans, setVpsPlans] = useState<VpsServerType[]>(VPS_POPULAR_FALLBACK);
  const [payProviders, setPayProviders] = useState<PayProvider[]>([
    { id: 'stripe', configured: false },
    { id: 'iyzico', configured: false },
    { id: 'paytr', configured: false },
  ]);
  const [payProvider, setPayProvider] = useState('stripe');
  const [domainQ, setDomainQ] = useState('');
  const [domainRows, setDomainRows] = useState<any[]>([]);
  const [domainBusy, setDomainBusy] = useState(false);

  useEffect(() => {
    apiService
      .getPackages()
      .then((res: any) => {
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
        if (res.providers?.length) {
          setPayProviders(res.providers);
          const preferred =
            res.providers.find((p: PayProvider) => p.id === 'stripe') ||
            res.providers[0];
          if (preferred?.id) setPayProvider(preferred.id);
        }
        const popular =
          res.vpsCatalog?.popularPlans || res.vpsCatalog?.serverTypes?.filter((p: VpsServerType) => p.popular);
        if (popular?.length) setVpsPlans(popular);
      })
      .catch((e) => setError(e.message));
  }, []);

  const selectedPlan = plans.find((p) => p.id === selected) || plans[0];
  const backupAddon =
    addons.find((a) => a.id === 'backup') || FALLBACK_ADDONS[0];
  const vpsAddon =
    addons.find((a) => a.id === 'vps') ||
    FALLBACK_ADDONS.find((a) => a.id === 'vps')!;
  const vpnAddon =
    addons.find((a) => a.id === 'vpn') ||
    FALLBACK_ADDONS.find((a) => a.id === 'vpn')!;
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

  const addToCart = () => {
    setError('');
    setCartToast('');
    if (!selectedPlan) return;
    addDatabasePlan({
      planId: selectedPlan.id,
      interval: effectiveInterval,
      backup: canAddBackup && backupOn,
      plan: {
        id: selectedPlan.id,
        name: selectedPlan.name,
        priceCents: selectedPlan.priceCents,
        priceYearCents: selectedPlan.priceYearCents,
        currency: selectedPlan.currency || 'usd',
        description: selectedPlan.description,
      },
    });
    setCartToast('Sepete eklendi');
    navigate('/cart');
  };

  const searchDomainMini = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!domainQ.trim()) return;
    setDomainBusy(true);
    setError('');
    try {
      const res = await apiService.domainSuggest(domainQ.trim());
      const list = res.data?.results || [];
      setDomainRows(list.length ? list : localDomainSuggest(domainQ.trim()));
    } catch {
      setDomainRows(localDomainSuggest(domainQ.trim()));
    } finally {
      setDomainBusy(false);
    }
  };

  const addDomainRow = (row: any) => {
    if (!row?.available) return;
    const fqdn = String(row.name || '').trim().toLowerCase();
    if (!fqdn) return;
    addItem({
      type: 'domain',
      id: fqdn,
      name: fqdn,
      priceCents: Number(row.priceUsdCents) || 0,
      currency: 'usd',
      years: 1,
      meta: { tld: row.tld },
    });
    setCartToast(`${fqdn} sepete eklendi`);
    navigate('/cart');
  };

  return (
    <MarketingShell active="pricing">
      <div className="hz-page-band">
        <div className="hz-page-band-inner">
          <span className="hz-pill">Pricing</span>
          <h1>Paket seçin</h1>
          <p>
            Sepete ekleyin, domain ekleyin, ödemeyi sepette tamamlayın.
          </p>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </div>

      <main className="pricing-main hz-pricing-main">
        <h2 className="hz-pricing-h2">Database</h2>
        <p>
          Trial 15 gün ücretsiz. Pro · Scale · Max — anlık kur ile € / $ / ₺.
          Yedekleme add-on ayrı faturalanır.
        </p>
        <p className="pricing-fx-hint">{fxHint}</p>

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
            Ödeme iptal edildi.{' '}
            <Link to="/cart">Sepete dönün</Link> veya paketi yeniden ekleyin.
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
                      ? `${formatCents(amount, plan.currency || 'usd', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}/yıl`
                      : `${formatCents(amount, plan.currency || 'usd', { maximumFractionDigits: 0, minimumFractionDigits: 0 })}/ay`}
                </p>
                {!isTrial && cardInterval === 'year' && (
                  <p className="landing-plan-equiv">
                    {formatCents(plan.priceCents || 0, plan.currency || 'usd', {
                      maximumFractionDigits: 0,
                      minimumFractionDigits: 0,
                    })}
                    /ay × 12
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
          className={`pricing-extra${canAddBackup ? '' : ' is-disabled'}`}
        >
          <input
            type="checkbox"
            checked={canAddBackup && backupOn}
            disabled={!canAddBackup}
            onChange={(e) => setBackupOn(e.target.checked)}
          />
          <div className="pricing-extra-body">
            <div className="pricing-extra-top">
              <strong>{backupAddon.name}</strong>
              <span className="pricing-extra-price">
                {formatCents(
                  addonAmount(backupAddon, effectiveInterval),
                  backupAddon.currency || 'usd',
                  { maximumFractionDigits: 0, minimumFractionDigits: 0 }
                )}
                <em>/{effectiveInterval === 'year' ? 'yıl' : 'ay'}</em>
              </span>
            </div>
            <p>{backupAddon.description}</p>
          </div>
        </label>

        <section id="vps-addon" className="pricing-extra pricing-extra-service">
          <div className="pricing-extra-body">
            <div className="pricing-extra-top">
              <div>
                <strong>{vpsAddon.name}</strong>
                <span className="pricing-extra-tag">Ayrı hizmet</span>
              </div>
              <Link to="/cloud" className="pricing-extra-link">
                Tüm planlar
              </Link>
            </div>
            <p>{vpsAddon.description}</p>

            <div className="pricing-mini-plans">
              {vpsPlans.slice(0, 4).map((p) => (
                <article key={p.name} className="pricing-mini-plan">
                  <h4>{(p.description || p.name).toUpperCase()}</h4>
                  <p className="pricing-mini-specs">
                    {serverTypeShortSpecs(p)}
                  </p>
                  <p className="pricing-mini-price">
                    {formatAmount(p.priceRetailMonthly, 'EUR')}
                    <span>/ay</span>
                  </p>
                </article>
              ))}
            </div>
          </div>
          <div className="pricing-extra-actions">
            <Link to="/cloud" className="hz-btn-solid">
              VPS seç — sepete ekle
            </Link>
            <Link to="/cart" className="landing-btn-ghost">
              Sepete git
            </Link>
          </div>
        </section>

        <section id="vpn-addon" className="pricing-extra pricing-extra-service">
          <div className="pricing-extra-body">
            <div className="pricing-extra-top">
              <div>
                <strong>{vpnAddon.name}</strong>
                <span className="pricing-extra-tag">Kullanıcı başına</span>
              </div>
              <span className="pricing-extra-price">
                {formatCents(
                  addonAmount(vpnAddon, 'month'),
                  vpnAddon.currency || 'eur'
                )}
                <em>/kullanıcı/ay</em>
              </span>
            </div>
            <p>{vpnAddon.description}</p>
            <ul className="pricing-extra-bullets">
              {(vpnAddon.messaging?.length
                ? vpnAddon.messaging
                : [
                    'Aktif peer başına faturalandırılır',
                    'Config indir veya QR tara',
                    'RDP / SSH için güvenli tünel',
                  ]
              ).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <div className="pricing-extra-actions">
            {isAuthenticated ? (
              <a
                href={vpnAddon.studioPath || `${CONSOLE_URL}/cloud/vpn`}
                className="hz-btn-solid"
              >
                VPN paneli
              </a>
            ) : (
              <Link
                to="/register"
                state={{ consolePath: '/cloud/vpn' }}
                className="hz-btn-solid"
              >
                Kayıt — VPN paneli
              </Link>
            )}
          </div>
        </section>

        {canAddBackup && (
          <p className="pricing-total">
            Toplam:{' '}
            <strong>
              {formatCents(totalCents, selectedPlan?.currency || 'usd', {
                maximumFractionDigits: 0,
                minimumFractionDigits: 0,
              })}
              /{effectiveInterval === 'year' ? 'yıl' : 'ay'}
            </strong>
            {backupOn ? ' (plan + yedekleme)' : ''}
          </p>
        )}

        <section className="pricing-domain-mini">
          <h2 className="hz-pricing-h2">Domain</h2>
          <p>Alan adı sorgulayın ve sepete ekleyin.</p>
          <form className="domain-search-form" onSubmit={searchDomainMini}>
            <input
              type="search"
              value={domainQ}
              onChange={(e) => setDomainQ(e.target.value)}
              placeholder="ornek.com"
              aria-label="Domain"
            />
            <button type="submit" className="hz-btn-solid" disabled={domainBusy}>
              {domainBusy ? '…' : 'Sorgula'}
            </button>
            <Link to="/domains" className="landing-btn-ghost">
              Tüm TLD’ler
            </Link>
          </form>
          {domainRows.length > 0 && (
            <ul className="domain-results domain-results-compact">
              {domainRows.slice(0, 5).map((row) => (
                <li key={row.name} className="domain-result-row">
                  <div>
                    <strong>{row.name}</strong>
                    <span className={row.available ? 'is-ok' : 'is-taken'}>
                      {row.available ? 'Müsait' : 'Kayıtlı'}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="hz-btn-solid"
                    disabled={!row.available}
                    onClick={() => addDomainRow(row)}
                  >
                    Sepete ekle
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {cartToast && (
          <div className="pricing-banner">
            {cartToast} — <Link to="/cart">Sepete git</Link>
          </div>
        )}

        <button
          type="button"
          className="landing-btn-primary"
          onClick={addToCart}
        >
          {selectedPlan?.priceCents === 0
            ? 'Trial’ı sepete ekle'
            : 'Sepete ekle'}
        </button>
        <p className="pricing-flow-hint">
          Önce sepete ekle → sonra sepette öde ·{' '}
          <Link to="/cart">Sepet</Link> · <Link to="/cloud">VPS</Link>
        </p>
      </main>
    </MarketingShell>
  );
};

export default PricingPage;
