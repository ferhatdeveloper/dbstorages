import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Code2,
  Database,
  KeyRound,
  Server,
  Shield,
  Table2,
  Terminal,
  Zap,
} from 'lucide-react';
import { apiService } from '../services/api';
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

const BACKUP_ADDON = {
  id: 'backup',
  name: 'Yedekleme',
  priceCents: 1000,
  priceYearCents: 12000,
  description: 'Aylık $10 veya yıllık $120 — ay başında faturalandırılır.',
};

const VPS_ADDON = {
  id: 'vps',
  name: 'VPS Kiralama',
  description:
    'Veritabanı planlarından bağımsız sunucu kiralama (Cloud Infrastructure).',
  studioPath: '/app/cloud/servers',
};

const SNIPPETS = [
  {
    id: 'sql',
    label: 'SQL',
    code: `SELECT id, email, created_at
FROM users
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 20;`,
  },
  {
    id: 'rest',
    label: 'REST',
    code: `curl https://api.graphcore.local/rest/v1/users \\
  -H "Authorization: Bearer $TOKEN" \\
  -H "Accept: application/json"`,
  },
  {
    id: 'js',
    label: 'JS',
    code: `const res = await fetch('/api/tables/users/rows', {
  headers: { Authorization: \`Bearer \${token}\` }
});
const { data } = await res.json();`,
  },
];

function formatPrice(cents: number, currency: string) {
  if (cents === 0) return 'Ücretsiz';
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: currency.toUpperCase() === 'USD' ? 'USD' : currency,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const LandingPage: React.FC = () => {
  const [plans, setPlans] = useState<Plan[]>(FALLBACK_PLANS);
  const [snippet, setSnippet] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    'month'
  );

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
                // Canonical monthly/yearly — ignore stale API amounts
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
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setSnippet((i) => (i + 1) % SNIPPETS.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, []);

  const displayAmount = (plan: Plan) => {
    if (!plan.priceCents) return 0;
    if (billingInterval === 'year') {
      return plan.priceYearCents ?? plan.priceCents * 12;
    }
    return plan.priceCents;
  };

  const featureLines = (plan: Plan) =>
    plan.features?.length
      ? plan.features
      : [
          `${plan.vcpu} vCPU`,
          plan.ramMb >= 1024
            ? `${plan.ramMb / 1024} GB RAM`
            : `${plan.ramMb} MB RAM`,
          `${plan.diskGb} GB disk`,
          `${plan.connections} bağlantı`,
        ];

  return (
    <div className="landing-root">
      <div className="landing-grid" aria-hidden />
      <div className="landing-glow" aria-hidden />

      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-mark" />
          GraphCore
        </Link>

        <button
          type="button"
          className="landing-menu-btn"
          aria-label="Menü"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
        </button>

        <nav className={`landing-nav-links${menuOpen ? ' is-open' : ''}`}>
          <a href="#product" onClick={() => setMenuOpen(false)}>
            Ürün
          </a>
          <a href="#features" onClick={() => setMenuOpen(false)}>
            Özellikler
          </a>
          <a href="#packages" onClick={() => setMenuOpen(false)}>
            Paketler
          </a>
          <a href="#cloud-vps" onClick={() => setMenuOpen(false)}>
            VPS
          </a>
          <Link to="/pricing" onClick={() => setMenuOpen(false)}>
            Fiyatlandırma
          </Link>
          <ThemeToggle />
          <Link to="/login" onClick={() => setMenuOpen(false)}>
            Giriş
          </Link>
          <Link
            to="/register"
            className="landing-cta-sm"
            onClick={() => setMenuOpen(false)}
          >
            Başla
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero — brand first, one composition */}
        <section className="landing-hero">
          <div className="landing-hero-copy">
            <p className="landing-brand-hero">GraphCore</p>
            <h1 className="landing-headline">
              Hafta sonu kur.
              <span className="landing-headline-accent"> Milyonlara ölçekle.</span>
            </h1>
            <p className="landing-sub">
              Kiralanabilir PostgreSQL, Table Editor ve SQL Studio — ödeme sonrası
              anında bağlantı. Stripe ve TR POS ile.
            </p>
            <div className="landing-actions">
              <Link to="/register" className="landing-btn-primary">
                Projeyi başlat
                <ArrowRight size={18} />
              </Link>
              <Link to="/pricing" className="landing-btn-ghost">
                Paketleri gör
              </Link>
            </div>
          </div>

          <div className="landing-hero-stage" aria-hidden>
            <div className="landing-studio-frame">
              <div className="landing-studio-chrome">
                <span className="landing-studio-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="landing-studio-title">studio · graphcore_demo</span>
              </div>
              <div className="landing-studio-body">
                <aside className="landing-studio-rail">
                  <span className="is-active">
                    <Table2 size={14} /> Tables
                  </span>
                  <span>
                    <Terminal size={14} /> SQL
                  </span>
                  <span>
                    <Database size={14} /> Schema
                  </span>
                  <span>
                    <KeyRound size={14} /> Auth
                  </span>
                </aside>
                <div className="landing-studio-panel">
                  <div className="landing-studio-toolbar">
                    <span>users</span>
                    <span className="landing-pill">24 rows</span>
                  </div>
                  <table className="landing-mini-table">
                    <thead>
                      <tr>
                        <th>id</th>
                        <th>email</th>
                        <th>status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>1</td>
                        <td>ada@graphcore.dev</td>
                        <td>
                          <em className="ok">ready</em>
                        </td>
                      </tr>
                      <tr>
                        <td>2</td>
                        <td>linus@graphcore.dev</td>
                        <td>
                          <em className="ok">ready</em>
                        </td>
                      </tr>
                      <tr>
                        <td>3</td>
                        <td>grace@graphcore.dev</td>
                        <td>
                          <em>idle</em>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Product showcase — Supabase-style feature blocks */}
        <section id="product" className="landing-product">
          <div className="landing-section-head">
            <h2>
              Tek platformda <em>Postgres</em> yığını
            </h2>
            <p>
              Veritabanı kiralama, görsel yönetim ve API erişimi — bir arada.
            </p>
          </div>

          <article className="landing-feature-hero">
            <div className="landing-feature-hero-copy">
              <div className="landing-feature-label">
                <Database size={18} />
                PostgreSQL
              </div>
              <h3>
                Her proje gerçek bir <strong>Postgres</strong> instance’ı
              </h3>
              <p>
                Schema introspection, Table Editor CRUD ve SQL execute — mock
                değil. Ödeme sonrası host, port ve kimlik bilgisi hemen gelir.
              </p>
              <ul className="landing-checks">
                <li>
                  <Check size={16} /> %100 taşınabilir SQL
                </li>
                <li>
                  <Check size={16} /> Table Editor + SQL Studio
                </li>
                <li>
                  <Check size={16} /> Bağlantı limiti ve disk planları
                </li>
              </ul>
            </div>
            <div className="landing-feature-hero-visual" aria-hidden>
              <pre className="landing-code-block">{`psql → graphcore_demo
\\dt
              List of relations
 Schema |  Name  | Type  | Owner
--------+--------+-------+--------
 public | users  | table | gc
 public | orders | table | gc`}</pre>
            </div>
          </article>

          <div className="landing-feature-grid">
            <article className="landing-feature-card">
              <Server size={20} />
              <h3>Instance kiralama</h3>
              <p>
                Free / Pro / Scale planları. vCPU, RAM ve disk ihtiyacına göre
                seçin; Stripe veya iyzico / PayTR ile ödeyin.
              </p>
            </article>
            <article className="landing-feature-card">
              <Shield size={20} />
              <h3>Auth & Studio</h3>
              <p>
                JWT ile kayıt ve giriş. Korumalı Studio akışları; proje bazlı
                erişim kontrolü.
              </p>
            </article>
            <article className="landing-feature-card">
              <Zap size={20} />
              <h3>REST over Postgres</h3>
              <p>
                İsteğe bağlı PostgREST yolu ile tablolarınızı anında REST API
                olarak açın.
              </p>
            </article>
            <article className="landing-feature-card">
              <Code2 size={20} />
              <h3>Geliştirici API</h3>
              <p>
                Kontrol düzlemi API’leri ile instance oluşturma, şema okuma ve
                satır işlemleri.
              </p>
            </article>
          </div>
        </section>

        {/* Code / snippets */}
        <section id="features" className="landing-snippets">
          <div className="landing-section-head landing-section-head-split">
            <div>
              <h2>
                Veriye <em>anında</em> dokun
              </h2>
              <p>
                SQL Editor, Table Editor veya REST — aynı Postgres’e üç yoldan
                erişin.
              </p>
            </div>
            <div className="landing-snippet-tabs" role="tablist">
              {SNIPPETS.map((s, i) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={snippet === i}
                  className={snippet === i ? 'is-active' : undefined}
                  onClick={() => setSnippet(i)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <div className="landing-snippet-stage">
            <pre key={SNIPPETS[snippet].id} className="landing-snippet-code">
              <code>{SNIPPETS[snippet].code}</code>
            </pre>
          </div>
        </section>

        {/* VPS / Cloud Infrastructure — ek hizmet */}
        <section id="cloud-vps" className="landing-cloud-vps">
          <div className="landing-section-head">
            <p className="landing-cloud-eyebrow">Ek hizmet</p>
            <h2>
              VPS &amp; <em>Cloud Infrastructure</em>
            </h2>
            <p>
              Veritabanı paketlerinden bağımsız sunucu kiralama: provider,
              region, image, volume, firewall, SSH key ve snapshot — Studio
              panelinden async provision.
            </p>
          </div>
          <div className="landing-cloud-grid">
            <article className="landing-cloud-point">
              <Server size={20} />
              <h3>Sunucu provision</h3>
              <p>Name, image, region, size, SSH key ve cloud-init alanları.</p>
            </article>
            <article className="landing-cloud-point">
              <Shield size={20} />
              <h3>Güvenlik &amp; depolama</h3>
              <p>Firewall kuralları, volume attach/detach, snapshot restore.</p>
            </article>
            <article className="landing-cloud-point">
              <Zap size={20} />
              <h3>İşlem izleme</h3>
              <p>
                Provisioning job’ları: pending → running → completed / failed.
              </p>
            </article>
          </div>
          <div className="landing-cloud-cta">
            <div>
              <h3>{VPS_ADDON.name}</h3>
              <p>
                {VPS_ADDON.description} Checkout ile değil — kayıt sonrası Cloud
                panelinden yönetilir.
              </p>
            </div>
            <div className="landing-actions">
              <Link to="/register" className="landing-btn-primary">
                Kayıt ol
                <ArrowRight size={18} />
              </Link>
              <Link to="/pricing#vps-addon" className="landing-btn-ghost">
                Fiyatlandırma
              </Link>
              <Link to={VPS_ADDON.studioPath} className="landing-btn-ghost">
                Cloud panel
              </Link>
            </div>
          </div>
        </section>

        {/* Pricing CTA */}
        <section id="packages" className="landing-packages">
          <div className="landing-section-head">
            <h2>Kiralama paketleri</h2>
            <p className="landing-packages-sub">
              Trial 15 gün ücretsiz. Pro $34 · Scale $50 · Max $99 / ay. Yıllık =
              aylık × 12. Yedekleme +$10/ay. VPS ayrı ek hizmet.
            </p>
          </div>

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

          <div className="landing-plan-grid landing-plan-grid-4">
            {plans.map((plan) => {
              const amount = displayAmount(plan);
              const isTrial = plan.priceCents === 0;
              return (
                <article
                  key={plan.id}
                  className={`landing-plan${plan.highlight ? ' is-hot' : ''}`}
                >
                  {plan.highlight && (
                    <span className="landing-plan-badge">Popüler</span>
                  )}
                  <h3>{plan.name}</h3>
                  <p className="landing-plan-price">
                    {isTrial
                      ? '15 gün ücretsiz'
                      : formatPrice(amount, plan.currency)}
                    {!isTrial && (
                      <span>
                        {' '}
                        / {billingInterval === 'year' ? 'yıl' : 'ay'}
                      </span>
                    )}
                  </p>
                  {!isTrial && billingInterval === 'year' && (
                    <p className="landing-plan-equiv">
                      {formatPrice(plan.priceCents, plan.currency)}/ay × 12
                    </p>
                  )}
                  <p className="landing-plan-desc">{plan.description}</p>
                  <ul>
                    {featureLines(plan).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <Link
                    to={`/pricing?plan=${plan.id}&interval=${isTrial ? 'month' : billingInterval}`}
                    className="landing-btn-primary landing-plan-cta"
                  >
                    {isTrial ? 'Denemeyi başlat' : 'Kirala'}
                  </Link>
                </article>
              );
            })}
          </div>

          <aside className="landing-addon-card">
            <div>
              <h3>{BACKUP_ADDON.name} add-on</h3>
              <p>
                {BACKUP_ADDON.description} Ücretli planlara checkout sırasında
                ekleyebilirsiniz.
              </p>
            </div>
            <Link
              to={`/pricing?plan=pro&backup=1&interval=${billingInterval}`}
              className="landing-btn-ghost"
            >
              {billingInterval === 'year' ? '+$120/yıl ekle' : '+$10/ay ekle'}
            </Link>
          </aside>

        </section>

        <section className="landing-cta-band">
          <h2>Bugün 15 gün ücretsiz deneyin</h2>
          <p>
            Trial ile başlayın; üretim için Pro, Scale veya Max’e geçin.
            Aylık veya yıllık faturalama.
          </p>
          <div className="landing-actions">
            <Link to="/register" className="landing-btn-primary">
              Ücretsiz dene
              <ArrowRight size={18} />
            </Link>
            <Link to="/pricing" className="landing-btn-ghost">
              Fiyatlandırmaya git
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <Link to="/" className="landing-brand">
            <span className="landing-mark" />
            GraphCore
          </Link>
          <p>PostgreSQL kiralama ve Studio platformu.</p>
        </div>
        <div className="landing-footer-cols">
          <div>
            <h4>Ürün</h4>
            <a href="#product">Postgres</a>
            <a href="#features">API</a>
            <Link to="/pricing">Paketler</Link>
            <a href="#cloud-vps">VPS / Cloud</a>
          </div>
          <div>
            <h4>Hesap</h4>
            <Link to="/login">Giriş</Link>
            <Link to="/register">Kayıt</Link>
            <Link to="/pricing">Kirala</Link>
          </div>
          <div>
            <h4>Geliştirici</h4>
            <span>Table Editor</span>
            <span>SQL Studio</span>
            <Link to="/app/cloud/servers">Cloud Infrastructure</Link>
          </div>
        </div>
        <div className="landing-footer-bar">
          <span>© {new Date().getFullYear()} GraphCore</span>
          <span>dbstorages</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
