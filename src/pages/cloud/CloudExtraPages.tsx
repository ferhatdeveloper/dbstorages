import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { apiService } from '../../services/api'

type ExtraKind =
  | 'primary-ips'
  | 'floating-ips'
  | 'load-balancers'
  | 'placement-groups'
  | 'certificates'
  | 'dns'
  | 'parity'

const TITLES: Record<ExtraKind, string> = {
  'primary-ips': 'Primary IPs',
  'floating-ips': 'Floating IPs',
  'load-balancers': 'Load Balancers',
  'placement-groups': 'Placement Groups',
  certificates: 'Certificates',
  dns: 'Reverse DNS',
  parity: 'Console Parity',
}

const fieldClass =
  'rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950'

const CloudExtraPage: React.FC<{ kind: ExtraKind }> = ({ kind }) => {
  const [rows, setRows] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [servers, setServers] = useState<any[]>([])
  const [parity, setParity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({
    providerId: '',
    name: '',
    type: 'ipv4',
    location: 'nbg1',
    serverId: '',
    ip: '',
    ptr: '',
    certificate: '',
    privateKey: '',
    domainNames: '',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      if (kind === 'parity') {
        const r = await apiService.cloudParity()
        setParity(r.data || [])
        return
      }
      const p = await apiService.cloudListProviders()
      setProviders(p.data || [])
      if (p.data?.[0]) {
        setForm((f) => ({ ...f, providerId: f.providerId || p.data![0].id }))
      }
      const s = await apiService.cloudListServers()
      setServers(s.data || [])

      if (kind === 'primary-ips') setRows((await apiService.cloudListPrimaryIps()).data || [])
      else if (kind === 'floating-ips')
        setRows((await apiService.cloudListFloatingIps()).data || [])
      else if (kind === 'load-balancers')
        setRows((await apiService.cloudListLoadBalancers()).data || [])
      else if (kind === 'placement-groups')
        setRows((await apiService.cloudListPlacementGroups()).data || [])
      else if (kind === 'certificates')
        setRows((await apiService.cloudListCertificates()).data || [])
      else setRows([])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (kind === 'primary-ips') {
        await apiService.cloudCreatePrimaryIp({
          providerId: form.providerId,
          name: form.name,
          type: form.type,
        })
      } else if (kind === 'floating-ips') {
        await apiService.cloudCreateFloatingIp({
          providerId: form.providerId,
          name: form.name,
          type: form.type,
          location: form.location,
        })
      } else if (kind === 'load-balancers') {
        await apiService.cloudCreateLoadBalancer({
          providerId: form.providerId,
          name: form.name,
          type: 'lb11',
          location: form.location,
        })
      } else if (kind === 'placement-groups') {
        await apiService.cloudCreatePlacementGroup({
          providerId: form.providerId,
          name: form.name,
          type: 'spread',
        })
      } else if (kind === 'certificates') {
        await apiService.cloudCreateCertificate({
          providerId: form.providerId,
          name: form.name,
          certificate: form.certificate,
          privateKey: form.privateKey,
          domainNames: form.domainNames
            ? form.domainNames.split(',').map((d) => d.trim())
            : [],
        })
      } else if (kind === 'dns') {
        await apiService.cloudSetReverseDns({
          providerId: form.providerId,
          ip: form.ip,
          ptr: form.ptr,
        })
      }
      setShow(false)
      setForm((f) => ({ ...f, name: '', ip: '', ptr: '', certificate: '', privateKey: '' }))
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return
    try {
      if (kind === 'primary-ips') await apiService.cloudDeletePrimaryIp(id)
      else if (kind === 'floating-ips') await apiService.cloudDeleteFloatingIp(id)
      else if (kind === 'load-balancers') await apiService.cloudDeleteLoadBalancer(id)
      else if (kind === 'placement-groups') await apiService.cloudDeletePlacementGroup(id)
      else if (kind === 'certificates') await apiService.cloudDeleteCertificate(id)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const assign = async (id: string) => {
    if (!form.serverId) {
      setError('Önce sunucu seçin')
      return
    }
    try {
      if (kind === 'primary-ips') {
        await apiService.cloudAssignPrimaryIp(id, form.serverId)
      } else {
        await apiService.cloudAssignFloatingIp(id, form.serverId)
      }
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (kind === 'parity') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{TITLES.parity}</h2>
          <button type="button" onClick={load} className="rounded-lg border px-2 py-1 text-xs dark:border-slate-700">
            <RefreshCw className="inline h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-xs text-slate-500">
          Hetzner Cloud Console işlemleri ↔ Studio Cloud. Stub = dürüst 501 (fake success yok).
        </p>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-3 py-2">Bölüm</th>
                  <th className="px-3 py-2">İşlem</th>
                  <th className="px-3 py-2">UI</th>
                  <th className="px-3 py-2">Durum</th>
                </tr>
              </thead>
              <tbody>
                {parity.map((r, i) => (
                  <tr key={i} className="border-t dark:border-slate-800">
                    <td className="px-3 py-2">{r.section}</td>
                    <td className="px-3 py-2">{r.action}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.path}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          r.status === 'full'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : r.status === 'partial'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800'
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {TITLES[kind]}
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-lg border px-2 py-1 text-xs dark:border-slate-700">
            <RefreshCw className="inline h-3.5 w-3.5" />
          </button>
          {kind !== 'dns' && (
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white dark:bg-lime-500 dark:text-slate-900"
            >
              <Plus className="h-3.5 w-3.5" /> Create
            </button>
          )}
          {kind === 'dns' && (
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white"
            >
              Set PTR
            </button>
          )}
        </div>
      </div>

      {(kind === 'primary-ips' || kind === 'floating-ips') && (
        <label className="grid max-w-xs gap-1 text-xs text-slate-500">
          Assign hedef sunucu
          <select
            className={fieldClass}
            value={form.serverId}
            onChange={(e) => setForm({ ...form, serverId: e.target.value })}
          >
            <option value="">Seçin</option>
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {show && (
        <form onSubmit={create} className="grid max-w-lg gap-2 rounded-xl border p-4 dark:border-slate-700">
          <label className="grid gap-1 text-xs text-slate-500">
            Provider
            <select
              className={fieldClass}
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              required
            >
              <option value="">Seçin</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {kind === 'dns' ? (
            <>
              <input
                className={fieldClass}
                placeholder="IP"
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                required
              />
              <input
                className={fieldClass}
                placeholder="PTR / hostname"
                value={form.ptr}
                onChange={(e) => setForm({ ...form, ptr: e.target.value })}
                required
              />
            </>
          ) : (
            <input
              className={fieldClass}
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          )}
          {(kind === 'primary-ips' || kind === 'floating-ips') && (
            <select
              className={fieldClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="ipv4">IPv4</option>
              <option value="ipv6">IPv6</option>
            </select>
          )}
          {(kind === 'floating-ips' || kind === 'load-balancers') && (
            <input
              className={fieldClass}
              placeholder="Location (nbg1)"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          )}
          {kind === 'certificates' && (
            <>
              <textarea
                className={fieldClass}
                rows={3}
                placeholder="PEM certificate"
                value={form.certificate}
                onChange={(e) => setForm({ ...form, certificate: e.target.value })}
              />
              <textarea
                className={fieldClass}
                rows={3}
                placeholder="Private key"
                value={form.privateKey}
                onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
              />
              <input
                className={fieldClass}
                placeholder="Domains (comma-separated)"
                value={form.domainNames}
                onChange={(e) => setForm({ ...form, domainNames: e.target.value })}
              />
            </>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 py-2 text-sm text-white"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Kaydet (async)'}
          </button>
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {kind === 'dns' ? (
        <p className="text-xs text-slate-500">
          Primary / Floating IP için reverse DNS (PTR). Job Activity’de görünür.
        </p>
      ) : loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">Detay</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t dark:border-slate-800">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.ip || r.public_ipv4 || r.lb_type || r.pg_type || r.cert_type || '—'}
                  </td>
                  <td className="px-3 py-2 text-xs">{r.status}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {(kind === 'primary-ips' || kind === 'floating-ips') && (
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-[10px] dark:border-slate-700"
                          onClick={() => assign(r.id)}
                        >
                          Assign
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded p-1 text-red-600"
                        onClick={() => remove(r.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-slate-400">
                    Kayıt yok
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export const CloudPrimaryIpsPage = () => <CloudExtraPage kind="primary-ips" />
export const CloudFloatingIpsPage = () => <CloudExtraPage kind="floating-ips" />
export const CloudLoadBalancersPage = () => <CloudExtraPage kind="load-balancers" />
export const CloudPlacementGroupsPage = () => <CloudExtraPage kind="placement-groups" />
export const CloudCertificatesPage = () => <CloudExtraPage kind="certificates" />
export const CloudDnsPage = () => <CloudExtraPage kind="dns" />
export const CloudParityPage = () => <CloudExtraPage kind="parity" />

export default CloudExtraPage
