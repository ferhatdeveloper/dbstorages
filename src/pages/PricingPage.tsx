import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

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

type Provider = { id: string; configured: boolean };

const PricingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selected, setSelected] = useState(params.get('plan') || 'pro');
  const [provider, setProvider] = useState('stripe');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [canceled] = useState(params.get('canceled') === '1');

  useEffect(() => {
    apiService
      .getPackages()
      .then((res) => {
        if (res.data) setPlans(res.data);
        if (res.providers) setProviders(res.providers);
      })
      .catch((e) => setError(e.message));
  }, []);

  const checkout = async () => {
    setError('');
    if (!isAuthenticated) {
      navigate('/register', { state: { plan: selected, from: '/pricing' } });
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.checkout({
        planId: selected,
        provider,
      });
      const data = res.data;
      if (data?.checkoutUrl && !data.mock && data.status === 'pending') {
        window.location.href = data.checkoutUrl;
        return;
      }
      if (data?.redirectUrl) {
        navigate(data.redirectUrl.replace(/^https?:\/\/[^/]+/, '') || '/billing/success');
        return;
      }
      if (data?.checkoutUrl) {
        // mock TR providers or stripe without keys → local success
        const url = new URL(data.checkoutUrl, window.location.origin);
        navigate(url.pathname + url.search);
        return;
      }
      navigate(`/billing/success?plan=${selected}&paymentId=${data?.paymentId || ''}`);
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
          <Link to="/login">Giriş</Link>
        </nav>
      </header>

      <main className="pricing-main">
        <h1>Paket seçin</h1>
        <p>Stripe Checkout veya TR POS (iyzico / PayTR) ile kiralayın.</p>

        {canceled && (
          <div className="pricing-banner">Ödeme iptal edildi. Tekrar deneyebilirsiniz.</div>
        )}
        {error && <div className="pricing-error">{error}</div>}

        <div className="landing-plan-grid">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              className={`landing-plan pricing-select${selected === plan.id ? ' is-selected' : ''}${plan.highlight ? ' is-hot' : ''}`}
              onClick={() => setSelected(plan.id)}
            >
              <h3>{plan.name}</h3>
              <p className="landing-plan-price">
                {plan.priceCents === 0
                  ? 'Ücretsiz'
                  : `$${(plan.priceCents / 100).toFixed(0)}/ay`}
              </p>
              <p className="landing-plan-desc">{plan.description}</p>
              <ul>
                <li>{plan.vcpu} vCPU</li>
                <li>{plan.ramMb} MB RAM</li>
                <li>{plan.diskGb} GB disk</li>
                <li>{plan.connections} bağlantı</li>
              </ul>
            </button>
          ))}
        </div>

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
          {loading ? 'İşleniyor…' : 'Kirala / Öde'}
        </button>
      </main>
    </div>
  );
};

export default PricingPage;
