import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiService, CONSOLE_URL } from '@graphcore/shared';
import MarketingShell from '../components/MarketingShell';

const BillingSuccessPage: React.FC = () => {
  const [params] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q: Record<string, string> = {};
    params.forEach((v, k) => {
      q[k] = v;
    });
    apiService
      .billingSuccess(q)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params]);

  return (
    <MarketingShell>
      <div className="hz-page-band hz-page-band-sm">
        <div className="hz-page-band-inner">
          <span className="hz-pill">Billing</span>
          <h1>Ödeme tamam</h1>
          <p>Instance hazırlanıyor veya bağlantı bilgileriniz aşağıda.</p>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </div>

      <main className="pricing-main hz-pricing-main">
        {loading && <p className="text-[var(--lc-muted)]">Instance hazırlanıyor…</p>}
        {error && <div className="pricing-error">{error}</div>}
        {!loading && data && (
          <div className="billing-success-card hz-auth-card" style={{ maxWidth: '40rem' }}>
            <p>
              Plan: <strong>{data.plan || data.instance?.plan || '—'}</strong>
              {(params.get('provider') || data.provider) ? (
                <> · Sağlayıcı: <strong>{params.get('provider') || data.provider}</strong></>
              ) : null}
            </p>
            {data.instance ? (
              <>
                <p>
                  Instance: <strong>{data.instance.name}</strong> (
                  {data.instance.status})
                </p>
                <p className="billing-conn-label">Database connection string</p>
                <code className="billing-conn">
                  {data.instance.connectionString || data.connectionString}
                </code>
                {(data.instance.restUrl || data.restUrl) && (
                  <>
                    <p className="billing-conn-label" style={{ marginTop: '1rem' }}>
                      Data API (PostgREST-compatible)
                    </p>
                    <code className="billing-conn">
                      {data.instance.restUrl || data.restUrl}
                    </code>
                    <p className="billing-note">
                      Örnek: <code>GET {'{restUrl}'}/users?select=*&limit=10</code> —
                      Bearer platform JWT + membership gerekir.
                    </p>
                  </>
                )}
                <p className="billing-note">
                  Project Auth: <code>/api/project-auth/{'{instanceId}'}/signup|login</code>
                </p>
              </>
            ) : (
              <p>
                Instance kaydı bulunamadı. Webhook gecikmiş olabilir veya mock
                ödeme tamamlanmamış olabilir.
              </p>
            )}
            {Array.isArray(data.domainOrders) && data.domainOrders.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p className="billing-conn-label">Domain siparişleri</p>
                <ul>
                  {data.domainOrders.map((d: any) => (
                    <li key={d.id || d.domain_name}>
                      {d.domain_name || d.name} — {d.status || 'ok'}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="landing-actions" style={{ marginTop: '1.5rem' }}>
              <a href={`${CONSOLE_URL}/database`} className="hz-btn-solid">
                Console — Database
              </a>
              <a href={`${CONSOLE_URL}/billing`} className="landing-btn-ghost">
                Ödeme geçmişi
              </a>
              <a href={`${CONSOLE_URL}/tables`} className="landing-btn-ghost">
                Table Editor
              </a>
              <Link to="/cart" className="landing-btn-ghost">
                Sepet
              </Link>
              <Link to="/database" className="landing-btn-ghost">
                Database
              </Link>
            </div>
          </div>
        )}
      </main>
    </MarketingShell>
  );
};

export default BillingSuccessPage;
