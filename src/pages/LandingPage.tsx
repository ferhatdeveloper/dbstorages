import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Database, Server, Shield, Zap } from 'lucide-react';
import { apiService } from '../services/api';

type Plan = {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: string;
  vcpu: number;
  ramMb: number;
  diskGb: number;
  connections: number;
  highlight?: boolean;
  description: string;
};

const FALLBACK_PLANS: Plan[] = [
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
    description: 'Yüksek bağlantı ve disk ihtiyacı olan ekipler.',
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

  useEffect(() => {
    apiService
      .getPackages()
      .then((res) => {
        if (res.data?.length) setPlans(res.data);
      })
      .catch(() => {
        /* keep fallback */
      });
  }, []);

  return (
    <div className="landing-root">
      <div className="landing-grid" aria-hidden />
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-mark" />
          GraphCore
        </Link>
        <nav className="landing-nav-links">
          <a href="#packages">Paketler</a>
          <Link to="/login">Giriş</Link>
          <Link to="/register" className="landing-cta-sm">
            Başla
          </Link>
        </nav>
      </header>

      <main>
        <section className="landing-hero">
          <p className="landing-brand-hero">GraphCore</p>
          <h1 className="landing-headline">
            Kiralanabilir Postgres.
            <br />
            Studio ile yönet.
          </h1>
          <p className="landing-sub">
            Veritabanı sunucusu kiralayın, Table Editor ve SQL ile anında
            çalışın. Stripe ve TR POS ile ödeme.
          </p>
          <div className="landing-actions">
            <Link to="/register" className="landing-btn-primary">
              Ücretsiz dene
              <ArrowRight size={18} />
            </Link>
            <a href="#packages" className="landing-btn-ghost">
              Paketleri gör
            </a>
          </div>
          <div className="landing-hero-visual" aria-hidden>
            <div className="landing-terminal">
              <div className="landing-terminal-bar">
                <span />
                <span />
                <span />
              </div>
              <pre>{`psql → graphcore_demo
SELECT name, status FROM instances;
   name     | status
------------+--------
 demo-db    | ready
 pro-a1b2c3 | ready`}</pre>
            </div>
          </div>
        </section>

        <section className="landing-features">
          <div>
            <Database size={22} />
            <h3>Gerçek Postgres</h3>
            <p>Schema introspection, CRUD ve SQL execute — mock değil.</p>
          </div>
          <div>
            <Server size={22} />
            <h3>Instance kiralama</h3>
            <p>Free / Pro / Scale planları; ödeme sonrası bağlantı bilgisi.</p>
          </div>
          <div>
            <Shield size={22} />
            <h3>JWT + Studio</h3>
            <p>Kayıt, giriş ve korumalı Studio akışları.</p>
          </div>
          <div>
            <Zap size={22} />
            <h3>PostgREST yolu</h3>
            <p>İsteğe bağlı PostgREST (:3001) ile REST over Postgres.</p>
          </div>
        </section>

        <section id="packages" className="landing-packages">
          <h2>Kiralama paketleri</h2>
          <p className="landing-packages-sub">
            İhtiyacınıza göre plan seçin. Ödeme sonrası instance kaydı oluşur.
          </p>
          <div className="landing-plan-grid">
            {plans.map((plan) => (
              <article
                key={plan.id}
                className={`landing-plan${plan.highlight ? ' is-hot' : ''}`}
              >
                <h3>{plan.name}</h3>
                <p className="landing-plan-price">
                  {formatPrice(plan.priceCents, plan.currency)}
                  {plan.priceCents > 0 && (
                    <span> / {plan.interval === 'month' ? 'ay' : plan.interval}</span>
                  )}
                </p>
                <p className="landing-plan-desc">{plan.description}</p>
                <ul>
                  <li>{plan.vcpu} vCPU</li>
                  <li>
                    {plan.ramMb >= 1024
                      ? `${plan.ramMb / 1024} GB RAM`
                      : `${plan.ramMb} MB RAM`}
                  </li>
                  <li>{plan.diskGb} GB disk</li>
                  <li>{plan.connections} bağlantı</li>
                </ul>
                <Link
                  to={`/pricing?plan=${plan.id}`}
                  className="landing-btn-primary landing-plan-cta"
                >
                  {plan.priceCents === 0 ? 'Ücretsiz başla' : 'Kirala'}
                </Link>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <span>GraphCore</span>
        <span>PostgreSQL kiralama platformu</span>
      </footer>
    </div>
  );
};

export default LandingPage;
