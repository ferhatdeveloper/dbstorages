import React, { useCallback, useEffect, useState } from 'react'
import { Globe, Loader2, Plus, Trash2 } from 'lucide-react'
import { apiService } from '../../services/api'
import {
  CloudEmptyState,
  CloudError,
  CloudLoading,
  CloudPageHeader,
  CloudSlideOver,
  CloudStatusPill,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudFieldClass,
  cloudPanelClass,
  cloudTableWrap,
  cloudTd,
  cloudTh,
  cloudThead,
  cloudTr,
} from './cloudUi'

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

const DESCRIPTIONS: Record<ExtraKind, string> = {
  'primary-ips': 'Kalıcı IPv4/IPv6 — sunucuya assign.',
  'floating-ips': 'Taşınabilir floating IP’ler.',
  'load-balancers': 'LB oluşturma ve yönetim.',
  'placement-groups': 'Spread / anti-affinity grupları.',
  certificates: 'TLS sertifikaları (PEM).',
  dns: 'Primary / Floating IP için reverse DNS (PTR).',
  parity: 'Hetzner Console ↔ Studio Cloud kapsama matrisi.',
}

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
        <CloudPageHeader
          title={TITLES.parity}
          description={DESCRIPTIONS.parity}
          onRefresh={load}
          refreshing={loading}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Stub = dürüst 501 (fake success yok).
        </p>
        {loading ? (
          <CloudLoading />
        ) : (
          <div className={cloudPanelClass}>
            <div className={`${cloudTableWrap} border-0`}>
              <table className="w-full text-left text-sm">
                <thead className={cloudThead}>
                  <tr>
                    <th className={cloudTh}>Bölüm</th>
                    <th className={cloudTh}>İşlem</th>
                    <th className={cloudTh}>UI</th>
                    <th className={cloudTh}>Durum</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900">
                  {parity.map((r, i) => (
                    <tr key={i} className={cloudTr}>
                      <td className={cloudTd}>{r.section}</td>
                      <td className={cloudTd}>{r.action}</td>
                      <td className={`${cloudTd} font-mono text-xs`}>{r.path}</td>
                      <td className={cloudTd}>
                        <CloudStatusPill status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CloudPageHeader
        title={TITLES[kind]}
        description={DESCRIPTIONS[kind]}
        onRefresh={load}
        refreshing={loading}
        actions={
          <button type="button" onClick={() => setShow(true)} className={cloudBtnPrimary}>
            <Plus className="h-3.5 w-3.5" />
            {kind === 'dns' ? 'Set PTR' : 'Create'}
          </button>
        }
      />

      <CloudError message={error} />

      {(kind === 'primary-ips' || kind === 'floating-ips') && (
        <label className={`${cloudPanelClass} grid max-w-xs gap-1 p-3 text-xs text-slate-500`}>
          Assign hedef sunucu
          <select
            className={cloudFieldClass}
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

      {kind === 'dns' ? (
        <div className={`${cloudPanelClass} p-4`}>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Primary / Floating IP için reverse DNS (PTR). Job Activity’de görünür.
          </p>
          <button type="button" onClick={() => setShow(true)} className={`${cloudBtnPrimary} mt-3`}>
            PTR kaydı oluştur
          </button>
        </div>
      ) : loading ? (
        <CloudLoading />
      ) : (
        <div className={cloudPanelClass}>
          {!rows.length ? (
            <CloudEmptyState
              icon={<Globe className="h-6 w-6" />}
              title="Kayıt yok"
              description={`${TITLES[kind]} için henüz kaynak yok. Create ile ekleyin.`}
              action={
                <button type="button" onClick={() => setShow(true)} className={cloudBtnPrimary}>
                  <Plus className="h-3.5 w-3.5" /> Create
                </button>
              }
            />
          ) : (
            <div className={`${cloudTableWrap} border-0`}>
              <table className="w-full text-left text-sm">
                <thead className={cloudThead}>
                  <tr>
                    <th className={cloudTh}>Ad</th>
                    <th className={cloudTh}>Detay</th>
                    <th className={cloudTh}>Durum</th>
                    <th className={cloudTh}>İşlem</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900">
                  {rows.map((r) => (
                    <tr key={r.id} className={cloudTr}>
                      <td className={`${cloudTd} font-medium`}>{r.name}</td>
                      <td className={`${cloudTd} font-mono text-xs`}>
                        {r.ip || r.public_ipv4 || r.lb_type || r.pg_type || r.cert_type || '—'}
                      </td>
                      <td className={cloudTd}>
                        <CloudStatusPill status={r.status} />
                      </td>
                      <td className={cloudTd}>
                        <div className="flex gap-1">
                          {(kind === 'primary-ips' || kind === 'floating-ips') && (
                            <button
                              type="button"
                              className={`${cloudBtnGhost} !py-0.5 !text-[10px]`}
                              onClick={() => assign(r.id)}
                            >
                              Assign
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded p-1.5 text-red-600"
                            onClick={() => remove(r.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CloudSlideOver
        open={show}
        onClose={() => setShow(false)}
        title={kind === 'dns' ? 'Reverse DNS (PTR)' : `${TITLES[kind]} — Create`}
        subtitle="Async işlem"
        footer={
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => setShow(false)} className={cloudBtnGhost}>
              İptal
            </button>
            <button
              type="submit"
              form="cloud-extra-create"
              disabled={saving}
              className={cloudBtnPrimary}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydet (async)'}
            </button>
          </div>
        }
      >
        <form id="cloud-extra-create" onSubmit={create} className="space-y-3">
          <label className="grid gap-1 text-xs text-slate-500">
            Provider
            <select
              className={cloudFieldClass}
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
                className={cloudFieldClass}
                placeholder="IP"
                value={form.ip}
                onChange={(e) => setForm({ ...form, ip: e.target.value })}
                required
              />
              <input
                className={cloudFieldClass}
                placeholder="PTR / hostname"
                value={form.ptr}
                onChange={(e) => setForm({ ...form, ptr: e.target.value })}
                required
              />
            </>
          ) : (
            <input
              className={cloudFieldClass}
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          )}
          {(kind === 'primary-ips' || kind === 'floating-ips') && (
            <select
              className={cloudFieldClass}
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="ipv4">IPv4</option>
              <option value="ipv6">IPv6</option>
            </select>
          )}
          {(kind === 'floating-ips' || kind === 'load-balancers') && (
            <input
              className={cloudFieldClass}
              placeholder="Location (nbg1)"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          )}
          {kind === 'certificates' && (
            <>
              <textarea
                className={cloudFieldClass}
                rows={3}
                placeholder="PEM certificate"
                value={form.certificate}
                onChange={(e) => setForm({ ...form, certificate: e.target.value })}
              />
              <textarea
                className={cloudFieldClass}
                rows={3}
                placeholder="Private key"
                value={form.privateKey}
                onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
              />
              <input
                className={cloudFieldClass}
                placeholder="Domains (comma-separated)"
                value={form.domainNames}
                onChange={(e) => setForm({ ...form, domainNames: e.target.value })}
              />
            </>
          )}
        </form>
      </CloudSlideOver>
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
