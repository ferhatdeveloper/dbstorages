import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiService } from '../services/api';

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
    <div className="landing-root pricing-page">
      <div className="landing-grid" aria-hidden />
      <header className="landing-nav">
        <Link to="/" className="landing-brand">
          <span className="landing-mark" />
          GraphCore
        </Link>
      </header>
      <main className="pricing-main">
        <h1>Ödeme tamam</h1>
        {loading && <p>Instance hazırlanıyor…</p>}
        {error && <div className="pricing-error">{error}</div>}
        {!loading && data && (
          <div className="billing-success-card">
            <p>
              Plan: <strong>{data.plan || data.instance?.plan || '—'}</strong>
            </p>
            {data.instance ? (
              <>
                <p>
                  Instance: <strong>{data.instance.name}</strong> (
                  {data.instance.status})
                </p>
                <p className="billing-conn-label">Bağlantı (yerel placeholder)</p>
                <code className="billing-conn">
                  {data.instance.connectionString || data.connectionString}
                </code>
                <p className="billing-note">
                  Gerçek provisioning henüz stub: yerel Docker Postgres
                  (graphcore_demo) gösterilir.
                </p>
              </>
            ) : (
              <p>
                Instance kaydı bulunamadı. Webhook gecikmiş olabilir veya mock
                ödeme tamamlanmamış olabilir.
              </p>
            )}
            <div className="landing-actions" style={{ marginTop: '1.5rem' }}>
              <Link to="/dashboard" className="landing-btn-primary">
                Studio&apos;ya git
              </Link>
              <Link to="/tables" className="landing-btn-ghost">
                Table Editor
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BillingSuccessPage;
