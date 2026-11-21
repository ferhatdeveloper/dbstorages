import React, { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiService } from '../../services/api'

export const SupervisorOverviewPage: React.FC = () => {
  const [data, setData] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    apiService
      .supervisorOverview()
      .then((res) => setData(res.data || null))
      .catch((e) => setError(e.message || 'Yüklenemedi'))
  }, [])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!data) return <p className="text-sm text-slate-500">Yükleniyor…</p>

  const cards = [
    { label: 'Kullanıcılar', value: data.users },
    { label: 'Tenant’lar', value: data.tenants },
    { label: 'Başarılı ödemeler', value: data.paymentsSucceeded },
    { label: 'Database instance', value: data.instances },
    { label: 'Cloud sunucu', value: data.cloudServers },
  ]

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Platform özeti</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded border border-slate-800 bg-[#121820] px-4 py-3"
          >
            <div className="text-[11px] uppercase tracking-wider text-slate-500">
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-100">
              {c.value ?? 0}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const SupervisorUsersPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    apiService
      .supervisorUsers({ q: q || undefined, pageSize: 50 })
      .then((res) => setRows(res.data || []))
      .catch((e) => setError(e.message || 'Yüklenemedi'))
  }

  useEffect(() => {
    load()
  }, [])

  const patch = async (id: string, body: { role?: string; disabled?: boolean }) => {
    setBusy(id)
    setError('')
    try {
      await apiService.supervisorPatchUser(id, body)
      load()
    } catch (e: any) {
      setError(e.message || 'Güncellenemedi')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold text-slate-100">Kullanıcılar</h1>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="E-posta / ad ara"
          className="ml-auto rounded border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-200"
        />
        <button
          type="button"
          onClick={load}
          className="rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
        >
          Ara
        </button>
      </div>
      {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">E-posta</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-t border-slate-800">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-200">{u.email}</div>
                  <div className="text-xs text-slate-500">{u.name}</div>
                </td>
                <td className="px-3 py-2 text-slate-300">{u.role}</td>
                <td className="px-3 py-2">
                  {u.disabled ? (
                    <span className="text-red-400">Kapalı</span>
                  ) : (
                    <span className="text-emerald-400">Aktif</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={busy === u.id}
                    className="mr-2 text-xs text-slate-400 hover:text-slate-200"
                    onClick={() =>
                      patch(u.id, {
                        role: u.role === 'supervisor' ? 'member' : 'supervisor',
                      })
                    }
                  >
                    {u.role === 'supervisor' ? 'Member yap' : 'Supervisor yap'}
                  </button>
                  <button
                    type="button"
                    disabled={busy === u.id}
                    className="text-xs text-slate-400 hover:text-red-400"
                    onClick={() => patch(u.id, { disabled: !u.disabled })}
                  >
                    {u.disabled ? 'Aç' : 'Kapat'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const SupervisorTenantsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiService
      .supervisorTenants({ pageSize: 50 })
      .then((res) => setRows(res.data || []))
      .catch((e) => setError(e.message || 'Yüklenemedi'))
  }, [])

  if (error) return <p className="text-sm text-red-400">{error}</p>

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Tenant’lar</h1>
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Üye</th>
              <th className="px-3 py-2">DB</th>
              <th className="px-3 py-2">VPS</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-t border-slate-800">
                <td className="px-3 py-2 font-medium text-slate-200">{t.name}</td>
                <td className="px-3 py-2 text-slate-400">{t.owner_email || '—'}</td>
                <td className="px-3 py-2 text-slate-300">{t.member_count}</td>
                <td className="px-3 py-2 text-slate-300">{t.instance_count}</td>
                <td className="px-3 py-2 text-slate-300">{t.server_count}</td>
                <td className="px-3 py-2 text-right">
                  <Link
                    to={`/supervisor/tenants/${t.id}`}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Detay
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const SupervisorTenantDetailPage: React.FC = () => {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    apiService
      .supervisorTenant(id)
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message || 'Yüklenemedi'))
  }, [id])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!data) return <p className="text-sm text-slate-500">Yükleniyor…</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/supervisor/tenants" className="text-xs text-slate-500 hover:text-slate-300">
          ← Tenant’lar
        </Link>
        <h1 className="mt-1 text-lg font-semibold text-slate-100">
          {data.tenant?.name}
        </h1>
        <p className="text-sm text-slate-500">{data.tenant?.owner_email}</p>
      </div>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Üyeler</h2>
        <ul className="space-y-1 text-sm text-slate-400">
          {(data.memberships || []).map((m: any) => (
            <li key={m.user_id}>
              {m.email} · {m.role}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Instances</h2>
        <ul className="space-y-1 text-sm text-slate-400">
          {(data.instances || []).map((i: any) => (
            <li key={i.id}>
              {i.name} · {i.plan} · {i.status}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold text-slate-300">Cloud servers</h2>
        <ul className="space-y-1 text-sm text-slate-400">
          {(data.servers || []).length === 0 ? (
            <li>—</li>
          ) : (
            (data.servers || []).map((s: any) => (
              <li key={s.id}>
                {s.name} · {s.status} · {s.ipv4 || '—'}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  )
}

export const SupervisorPaymentsPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = () => {
    apiService
      .supervisorPayments({ pageSize: 50 })
      .then((res) => setRows(res.data || []))
      .catch((e) => setError(e.message || 'Yüklenemedi'))
  }

  useEffect(() => {
    load()
  }, [])

  const replay = async (id: string) => {
    setBusy(id)
    setError('')
    try {
      await apiService.supervisorReplayProvision(id)
      load()
    } catch (e: any) {
      setError(e.message || 'Replay başarısız')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Ödemeler</h1>
      {error ? <p className="mb-2 text-sm text-red-400">{error}</p> : null}
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Plan</th>
              <th className="px-3 py-2">Provider</th>
              <th className="px-3 py-2">Tutar</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-slate-800">
                <td className="px-3 py-2 text-slate-200">
                  {p.plan_id || p.planId}
                  <div className="text-[11px] text-slate-500">{p.id}</div>
                </td>
                <td className="px-3 py-2 text-slate-400">{p.provider}</td>
                <td className="px-3 py-2 text-slate-300">
                  {(p.amount_cents ?? p.amountCents ?? 0) / 100}{' '}
                  {(p.currency || 'usd').toUpperCase()}
                </td>
                <td className="px-3 py-2 text-slate-300">{p.status}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => replay(p.id)}
                    className="text-xs text-red-400 hover:underline"
                  >
                    Replay provision
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export const SupervisorServersPage: React.FC = () => {
  const [rows, setRows] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    apiService
      .supervisorServers({ pageSize: 50 })
      .then((res: { data?: any[] }) => setRows(res.data || []))
      .catch((e: any) => setError(e.message || 'Yüklenemedi'))
  }, [])

  if (error) return <p className="text-sm text-red-400">{error}</p>

  return (
    <div>
      <h1 className="mb-4 text-lg font-semibold text-slate-100">
        Cloud sunucular (tüm tenant’lar)
      </h1>
      <div className="overflow-x-auto rounded border border-slate-800">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-900/80 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">Ad</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Tip</th>
              <th className="px-3 py-2">IP</th>
              <th className="px-3 py-2">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                  Kayıt yok
                </td>
              </tr>
            ) : (
              rows.map((s) => (
                <tr key={s.id} className="border-t border-slate-800">
                  <td className="px-3 py-2 text-slate-200">{s.name}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {s.tenant_name || s.tenant_id}
                  </td>
                  <td className="px-3 py-2 text-slate-300">{s.server_type || '—'}</td>
                  <td className="px-3 py-2 text-slate-300">{s.ipv4 || '—'}</td>
                  <td className="px-3 py-2 text-slate-300">{s.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
