import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { useCurrency } from '@graphcore/shared';
import { Receipt } from 'lucide-react';

type Payment = {
  id: string;
  provider?: string;
  plan_id?: string;
  planId?: string;
  amount_cents?: number;
  amountCents?: number;
  currency?: string;
  status?: string;
  created_at?: string;
  createdAt?: string;
  external_id?: string;
};

const BillingHistoryPage: React.FC = () => {
  const { formatCents, fxHint } = useCurrency();
  const [rows, setRows] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiService.billingHistory();
        if (cancelled) return;
        setRows(res.data || []);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Geçmiş yüklenemedi');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = (p: Payment) => {
    const cents = p.amount_cents ?? p.amountCents ?? 0;
    const cur = p.currency || 'usd';
    return formatCents(cents, cur);
  };

  return (
    <div className="h-full bg-[#f8fafb] p-6">
      <div className="mb-6 flex items-center gap-3">
        <Receipt className="h-6 w-6 text-blue-700" />
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Ödeme geçmişi</h1>
          <p className="text-sm text-gray-500">
            Stripe / iyzico / PayTR kayıtları · {fxHint}
          </p>
        </div>
      </div>

      {loading && <div className="text-sm text-gray-500">Yükleniyor…</div>}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="overflow-hidden rounded-lg border bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Tarih</th>
                <th className="px-4 py-3">Plan</th>
                <th className="px-4 py-3">Sağlayıcı</th>
                <th className="px-4 py-3">Tutar</th>
                <th className="px-4 py-3">Durum</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Henüz ödeme kaydı yok. Paket satın alınca burada görünür.
                  </td>
                </tr>
              )}
              {rows.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(p.created_at || p.createdAt || Date.now()).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{p.plan_id || p.planId || '—'}</td>
                  <td className="px-4 py-3">{p.provider || '—'}</td>
                  <td className="px-4 py-3">{fmt(p)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        p.status === 'succeeded'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {p.status || 'pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BillingHistoryPage;
