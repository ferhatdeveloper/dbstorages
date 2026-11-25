import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Database,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  Table2,
  X,
} from 'lucide-react';
import { api } from '../services/api';

type DashInstance = {
  id: string;
  name: string;
  database: string;
  status: string;
  host?: string;
  port?: number;
  plan?: string;
  region?: string;
  createdAt?: string;
  restUrl?: string;
};

type DashStats = {
  totalTables: number;
  totalRows: number;
  activeConnections: number;
  instanceCount: number;
  readyCount: number;
  pausedCount: number;
  provisioningCount: number;
  instances: DashInstance[];
  systemHealth: string;
  metaDb: boolean;
  tenantDb: boolean;
};

function formatTrDate(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusBadge(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'ready') return 'bg-emerald-100 text-emerald-800';
  if (s === 'paused') return 'bg-amber-100 text-amber-800';
  if (['provisioning', 'pending', 'creating'].includes(s))
    return 'bg-blue-100 text-blue-800';
  if (s === 'error' || s === 'failed') return 'bg-red-100 text-red-800';
  return 'bg-gray-100 text-gray-700';
}

function statusLabel(status: string) {
  const s = String(status || '').toLowerCase();
  if (s === 'ready') return 'Hazır';
  if (s === 'paused') return 'Duraklatıldı';
  if (['provisioning', 'pending', 'creating'].includes(s)) return 'Kuruluyor';
  if (s === 'error' || s === 'failed') return 'Hata';
  return status || '—';
}

const DashboardPage: React.FC = () => {
  const [stats, setStats] = useState<DashStats | null>(null);
  const [widgets, setWidgets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const showNotification = useCallback(
    (type: 'success' | 'error', message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 3000);
    },
    []
  );

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsRes, widgetsRes] = await Promise.all([
        api.getDashboardStats(),
        api.getDashboardWidgets().catch(() => ({ widgets: [] })),
      ]);
      setStats(statsRes as DashStats);
      setWidgets((widgetsRes as any)?.widgets || []);
    } catch (e: any) {
      setError(e?.message || 'Dashboard yüklenemedi');
      showNotification('error', 'Dashboard verileri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  if (loading && !stats) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const instances = stats?.instances || [];
  const health = stats?.systemHealth || 'empty';

  return (
    <div className="min-h-full bg-gray-50 p-4 md:p-6">
      {toast && (
        <div
          className={`fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-white shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle size={16} />
          ) : (
            <AlertCircle size={16} />
          )}
          <span>{toast.message}</span>
          <button type="button" onClick={() => setToast(null)} className="ml-1">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hesabınızdaki veritabanı sunucuları ve platform durumu
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/connections"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            <Database size={16} />
            Bağlantılar
          </Link>
          <button
            type="button"
            onClick={loadDashboardData}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Yenile
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard
          icon={<Server className="text-blue-600" size={22} />}
          label="Toplam DB"
          value={stats?.instanceCount ?? 0}
        />
        <MetricCard
          icon={<CheckCircle className="text-emerald-600" size={22} />}
          label="Hazır"
          value={stats?.readyCount ?? 0}
        />
        <MetricCard
          icon={<Table2 className="text-indigo-600" size={22} />}
          label="Tablolar"
          value={stats?.totalTables ?? 0}
          hint={
            stats?.totalRows
              ? `${Number(stats.totalRows).toLocaleString('tr-TR')} satır`
              : undefined
          }
        />
        <MetricCard
          icon={
            health === 'ok' ? (
              <CheckCircle className="text-emerald-600" size={22} />
            ) : (
              <AlertCircle className="text-amber-600" size={22} />
            )
          }
          label="Sistem"
          value={
            health === 'ok'
              ? 'Sağlıklı'
              : health === 'degraded'
                ? 'Kısmi'
                : 'Boş'
          }
          hint={
            stats?.metaDb ? 'Meta DB bağlı' : 'Meta DB yok'
          }
        />
      </div>

      {widgets.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {widgets.map((w) => (
            <div
              key={w.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {w.title}
              </p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {String(w.value)}
              </p>
              {w.label && (
                <p className="mt-1 text-xs text-gray-500">{w.label}</p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Veritabanı sunucuları
          </h2>
          <span className="text-xs text-gray-500">
            {instances.length} kayıt
          </span>
        </div>

        {instances.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <Database className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm font-medium text-gray-900">
              Henüz veritabanı yok
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Sipariş veya seed sonrası sunucular burada listelenir.
            </p>
            <Link
              to="/billing"
              className="mt-4 inline-flex text-sm text-blue-600 hover:underline"
            >
              Faturalandırmaya git
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Firma</th>
                  <th className="px-4 py-3 font-medium">Veritabanı</th>
                  <th className="px-4 py-3 font-medium">Durum</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium">Tarih</th>
                  <th className="px-4 py-3 font-medium"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {instances.map((inst) => (
                  <tr key={inst.id} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {inst.name || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {inst.database}
                      {inst.host ? (
                        <div className="mt-0.5 font-sans text-[11px] text-gray-400">
                          {inst.host}:{inst.port || 5432}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge(
                          inst.status
                        )}`}
                      >
                        {statusLabel(inst.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize text-gray-600">
                      {inst.plan || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatTrDate(inst.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to="/tables"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Studio
                        </Link>
                        {inst.restUrl ? (
                          <a
                            href={inst.restUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-xs text-gray-500 hover:text-gray-800"
                            title="REST"
                          >
                            API
                            <ExternalLink size={11} />
                          </a>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
          {hint ? (
            <p className="mt-1 text-xs text-gray-400">{hint}</p>
          ) : null}
        </div>
        {icon}
      </div>
    </div>
  );
}

export default DashboardPage;
