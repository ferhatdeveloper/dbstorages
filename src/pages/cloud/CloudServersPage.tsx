import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2,
  Plus,
  Power,
  PowerOff,
  RotateCcw,
  Trash2,
  MoreHorizontal,
  Server,
  Cpu,
} from 'lucide-react'
import { apiService } from '../../services/api'
import {
  formatEur,
  serverTypeShortSpecs,
  type VpsServerType,
  VPS_POPULAR_FALLBACK,
} from '../../lib/vpsCatalog'
import {
  CloudEmptyState,
  CloudError,
  CloudLoading,
  CloudPageHeader,
  CloudSlideOver,
  CloudStatusPill,
  SIZE_FAMILIES,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudFieldClass,
  cloudPanelClass,
  cloudTableWrap,
  cloudTd,
  cloudTh,
  cloudThead,
  cloudTr,
  detectSizeFamily,
} from './cloudUi'

type ServerRow = {
  id: string
  name: string
  status: string
  server_type?: string
  image?: string
  location?: string
  ipv4?: string
  ipv6?: string
  provider_id?: string
  cost_provider?: number | null
  price_retail?: number | null
  currency?: string
}

type Provider = { id: string; name: string; slug: string }
type SshKey = { id: string; name: string; external_id?: string }

const ADVANCED_ACTIONS: [string, string][] = [
  ['reset', 'Reset (hard)'],
  ['resize', 'Resize type'],
  ['rebuild', 'Rebuild OS'],
  ['enable_rescue', 'Enable rescue'],
  ['disable_rescue', 'Disable rescue'],
  ['rename', 'Rename'],
  ['labels', 'Set labels'],
  ['change_protection', 'Protect delete'],
  ['attach_iso', 'Attach ISO'],
  ['detach_iso', 'Detach ISO'],
  ['request_console', 'Console / VNC'],
  ['enable_backup', 'Enable backups'],
  ['disable_backup', 'Disable backups'],
  ['metrics', 'Metrics (stub)'],
]

const CloudServersPage: React.FC = () => {
  const [rows, setRows] = useState<ServerRow[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [sshKeys, setSshKeys] = useState<SshKey[]>([])
  const [images, setImages] = useState<{ id: string; name?: string }[]>([])
  const [regions, setRegions] = useState<{ id: string; name?: string; description?: string }[]>([])
  const [sizes, setSizes] = useState<VpsServerType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [sizeFamily, setSizeFamily] = useState<string>('cx')
  const [form, setForm] = useState({
    providerId: '',
    name: '',
    serverType: 'cx23',
    image: 'ubuntu-22.04',
    location: 'nbg1',
    sshKeyId: '',
    userData: '',
  })
  const [saving, setSaving] = useState(false)

  const selectedSize = useMemo(
    () => sizes.find((s) => (s.name || s.id) === form.serverType) || null,
    [sizes, form.serverType]
  )

  const sizesByFamily = useMemo(() => {
    const map: Record<string, VpsServerType[]> = {}
    for (const s of sizes) {
      const fam = detectSizeFamily(s.name || s.id || '', s.family)
      if (!map[fam]) map[fam] = []
      map[fam].push(s)
    }
    return map
  }, [sizes])

  const familyTabs = useMemo(() => {
    const known = SIZE_FAMILIES.filter((f) => (sizesByFamily[f.id] || []).length > 0)
    const extras = Object.keys(sizesByFamily)
      .filter((k) => k !== 'other' && !SIZE_FAMILIES.some((f) => f.id === k))
      .map((id) => ({ id, label: id.toUpperCase(), hint: '' }))
    const other =
      (sizesByFamily.other || []).length > 0
        ? [{ id: 'other', label: 'Diğer', hint: '' }]
        : []
    const tabs = [...known, ...extras, ...other]
    return tabs.length ? tabs : [...SIZE_FAMILIES]
  }, [sizesByFamily])

  const visibleSizes = sizesByFamily[sizeFamily] || sizesByFamily[familyTabs[0]?.id] || sizes

  useEffect(() => {
    if (!familyTabs.length) return
    if (!familyTabs.some((t) => t.id === sizeFamily)) {
      setSizeFamily(familyTabs[0].id)
    }
  }, [familyTabs, sizeFamily])

  useEffect(() => {
    if (!selectedSize) return
    const fam = detectSizeFamily(selectedSize.name || '', selectedSize.family)
    if (fam !== sizeFamily && (sizesByFamily[fam] || []).length) {
      setSizeFamily(fam)
    }
  }, [form.serverType]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadCatalog = useCallback(async (providerId: string) => {
    if (!providerId) return
    try {
      const [img, reg, typ] = await Promise.all([
        apiService.cloudCatalog('images', providerId).catch(() => ({ data: [] })),
        apiService.cloudCatalog('regions', providerId).catch(() => ({ data: [] })),
        apiService.cloudCatalog('server-types', providerId).catch(() => ({ data: [] })),
      ])
      setImages(img.data || [])
      setRegions(reg.data || [])
      const types = (typ.data || []) as VpsServerType[]
      setSizes(types.length ? types : VPS_POPULAR_FALLBACK)
      setForm((f) => ({
        ...f,
        image: String(img.data?.[0]?.name || img.data?.[0]?.id || f.image),
        location: String(reg.data?.[0]?.name || reg.data?.[0]?.id || f.location),
        serverType: String(
          types[0]?.name || types[0]?.id || VPS_POPULAR_FALLBACK[0].name || f.serverType
        ),
      }))
    } catch {
      setSizes(VPS_POPULAR_FALLBACK)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, p, k] = await Promise.all([
        apiService.cloudListServers(),
        apiService.cloudListProviders(),
        apiService.cloudListSshKeys(),
      ])
      setRows(s.data || [])
      setProviders(p.data || [])
      setSshKeys(k.data || [])
      if (p.data?.[0]) {
        setForm((f) => {
          const next = f.providerId || p.data![0].id
          return { ...f, providerId: next }
        })
      } else {
        try {
          const pub = await apiService.cloudPublicCatalog()
          setSizes(pub.data?.serverTypes || VPS_POPULAR_FALLBACK)
        } catch {
          setSizes(VPS_POPULAR_FALLBACK)
        }
      }
    } catch (e: any) {
      setError(e.message || 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (form.providerId) loadCatalog(form.providerId)
  }, [form.providerId, loadCatalog])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const selectedKey = sshKeys.find((k) => k.id === form.sshKeyId)
      await apiService.cloudCreateServer({
        providerId: form.providerId,
        name: form.name,
        serverType: form.serverType,
        image: form.image,
        location: form.location,
        userData: form.userData || undefined,
        sshKeys: selectedKey?.external_id
          ? [selectedKey.external_id]
          : form.sshKeyId
            ? [form.sshKeyId]
            : undefined,
        enableIpv4: true,
        enableIpv6: true,
      })
      setShowForm(false)
      setForm((f) => ({ ...f, name: '', userData: '', sshKeyId: '' }))
      await load()
    } catch (err: any) {
      setError(err.message || 'Oluşturma başarısız')
    } finally {
      setSaving(false)
    }
  }

  const act = async (id: string, action: 'reboot' | 'power-on' | 'power-off' | 'delete') => {
    try {
      if (action === 'delete') {
        if (!window.confirm('Sunucu silinsin mi?')) return
        await apiService.cloudDeleteServer(id)
      } else if (action === 'reboot') await apiService.cloudRebootServer(id)
      else if (action === 'power-on') await apiService.cloudPowerOnServer(id)
      else await apiService.cloudPowerOffServer(id)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const advancedAct = async (id: string, action: string) => {
    try {
      let body: Record<string, unknown> = {}
      if (action === 'resize') {
        const serverType = window.prompt('Yeni server type (örn. cx33)', 'cx33')
        if (!serverType) return
        body = { serverType }
      } else if (action === 'rebuild') {
        const image = window.prompt('Image (örn. ubuntu-22.04)', 'ubuntu-22.04')
        if (!image) return
        body = { image }
      } else if (action === 'rename') {
        const name = window.prompt('Yeni ad')
        if (!name) return
        body = { name }
      } else if (action === 'attach_iso') {
        const iso = window.prompt('ISO adı / id')
        if (!iso) return
        body = { iso }
      } else if (action === 'change_protection') {
        body = { delete: true, rebuild: true }
      } else if (action === 'labels') {
        body = { labels: { managed_by: 'dbstorages' } }
      } else if (action === 'metrics') {
        await apiService.cloudServerAction(id, 'metrics', {})
        return
      }
      const res = await apiService.cloudServerAction(id, action, body)
      if (action === 'request_console' || action === 'console') {
        const opId = (res as any).operationId
        window.alert(
          opId
            ? `Console isteği kuyruğa alındı (${opId}). Activity’den sonucu kontrol edin (wssUrl).`
            : 'Console isteği gönderildi'
        )
      }
      await load()
    } catch (err: any) {
      setError(err.message || 'İşlem başarısız')
    }
  }

  const runningCount = rows.filter((r) =>
    ['running', 'active', 'online'].includes(String(r.status || '').toLowerCase())
  ).length

  const catalogPreview = useMemo(() => {
    const popular = sizes.filter((s) => s.popular).slice(0, 4)
    return popular.length ? popular : sizes.slice(0, 4)
  }, [sizes])

  return (
    <div className="space-y-4">
      <CloudPageHeader
        title="Servers"
        description="Sunucu listesi ve async provision. Fiyatlar perakende (×1.20 EUR, KDV hariç)."
        onRefresh={load}
        refreshing={loading}
        actions={
          <button type="button" onClick={() => setShowForm(true)} className={cloudBtnPrimary}>
            <Plus className="h-3.5 w-3.5" /> Provision
          </button>
        }
      />

      <CloudError message={error} />

      {loading ? (
        <CloudLoading />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className={cloudPanelClass}>
            {!rows.length ? (
              <CloudEmptyState
                icon={<Server className="h-6 w-6" />}
                title="Henüz sunucu yok"
                description="Provision ile ilk sunucuyu oluşturun. Katalog fiyatları sağ panelde; oluşturma slide-over üzerinden yapılır."
                action={
                  <button type="button" onClick={() => setShowForm(true)} className={cloudBtnPrimary}>
                    <Plus className="h-3.5 w-3.5" /> Sunucu oluştur
                  </button>
                }
              />
            ) : (
              <div className={cloudTableWrap + ' border-0'}>
                <table className="w-full text-left text-sm">
                  <thead className={cloudThead}>
                    <tr>
                      <th className={cloudTh}>Ad</th>
                      <th className={cloudTh}>Durum</th>
                      <th className={cloudTh}>Tip / Image</th>
                      <th className={cloudTh}>Fiyat</th>
                      <th className={cloudTh}>IP</th>
                      <th className={cloudTh}>İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {rows.map((r) => (
                      <tr key={r.id} className={cloudTr}>
                        <td className={`${cloudTd} font-medium text-slate-900 dark:text-slate-100`}>
                          {r.name}
                        </td>
                        <td className={cloudTd}>
                          <CloudStatusPill status={r.status} />
                        </td>
                        <td className={`${cloudTd} text-xs text-slate-500 dark:text-slate-400`}>
                          <span className="font-mono text-[11px] uppercase text-slate-700 dark:text-slate-200">
                            {r.server_type || '—'}
                          </span>
                          <span className="mt-0.5 block">
                            {r.image || '—'} · {r.location || '—'}
                          </span>
                        </td>
                        <td className={`${cloudTd} text-xs text-slate-600 dark:text-slate-300`}>
                          {r.price_retail != null ? (
                            <>
                              <span className="font-medium">{formatEur(Number(r.price_retail))}/ay</span>
                              <span className="mt-0.5 block text-[10px] text-slate-400">
                                cost {formatEur(Number(r.cost_provider))}
                              </span>
                            </>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className={`${cloudTd} font-mono text-xs`}>{r.ipv4 || '—'}</td>
                        <td className={cloudTd}>
                          <div className="flex flex-wrap items-center gap-0.5">
                            <button
                              type="button"
                              title="Reboot"
                              onClick={() => act(r.id, 'reboot')}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Power on"
                              onClick={() => act(r.id, 'power-on')}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <Power className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Power off"
                              onClick={() => act(r.id, 'power-off')}
                              className="rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              <PowerOff className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Delete"
                              onClick={() => act(r.id, 'delete')}
                              className="rounded p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <details className="relative">
                              <summary className="list-none cursor-pointer rounded p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </summary>
                              <div className="absolute right-0 z-10 mt-1 max-h-64 w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                                {ADVANCED_ACTIONS.map(([a, label]) => (
                                  <button
                                    key={a}
                                    type="button"
                                    className="block w-full px-3 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
                                    onClick={() => advancedAct(r.id, a)}
                                  >
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </details>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="space-y-3">
            <div className={`${cloudPanelClass} p-4`}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Özet
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                    {rows.length}
                  </p>
                  <p className="text-[11px] text-slate-500">Toplam</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-lime-400">
                    {runningCount}
                  </p>
                  <p className="text-[11px] text-slate-500">Çalışan</p>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="text-[11px] text-slate-500">
                  Provider: <span className="font-medium text-slate-700 dark:text-slate-200">{providers.length}</span>
                </p>
              </div>
            </div>

            <div className={`${cloudPanelClass} p-4`}>
              <div className="flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-teal-700 dark:text-lime-400" />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Katalog (perakende)
                </p>
              </div>
              <ul className="mt-3 space-y-2">
                {catalogPreview.map((s) => (
                  <li
                    key={s.id || s.name}
                    className="flex items-baseline justify-between gap-2 text-xs"
                  >
                    <span className="font-mono font-medium uppercase text-slate-800 dark:text-slate-100">
                      {(s.description || s.name).toUpperCase()}
                    </span>
                    <span className="shrink-0 font-semibold text-teal-800 dark:text-lime-400">
                      {formatEur(s.priceRetailMonthly)}
                    </span>
                  </li>
                ))}
                {!catalogPreview.length && (
                  <li className="text-xs text-slate-400">Katalog yükleniyor…</li>
                )}
              </ul>
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className={`${cloudBtnGhost} mt-3 w-full`}
              >
                Plan seç &amp; provision
              </button>
            </div>
          </aside>
        </div>
      )}

      <CloudSlideOver
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Sunucu provision"
        subtitle="Boyut ailesi seçin · perakende fiyat ×1.20 EUR"
        wide
        footer={
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={() => setShowForm(false)} className={cloudBtnGhost}>
              İptal
            </button>
            <button
              type="submit"
              form="cloud-provision-form"
              disabled={saving || !providers.length}
              className={cloudBtnPrimary + ' min-w-[10rem]'}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Oluştur (async)'
              )}
            </button>
          </div>
        }
      >
        <form id="cloud-provision-form" onSubmit={create} className="space-y-4">
          {!providers.length && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Önce Providers sekmesinden provider ekleyin.
            </p>
          )}

          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            Provider
            <select
              className={cloudFieldClass}
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              required
            >
              <option value="">Provider seçin</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            Sunucu adı
            <input
              className={cloudFieldClass}
              placeholder="web-01"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              Size (aile + perakende)
            </p>
            <div className="mb-3 flex flex-wrap gap-1">
              {familyTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSizeFamily(tab.id)}
                  className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    sizeFamily === tab.id
                      ? 'bg-teal-700 text-white dark:bg-lime-500 dark:text-slate-900'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                  title={'hint' in tab ? String(tab.hint || '') : ''}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {sizes.length ? (
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {(visibleSizes.length ? visibleSizes : sizes).map((s) => {
                  const value = s.name || s.id || ''
                  const selected = form.serverType === value
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, serverType: value })}
                      className={`rounded-lg border p-3 text-left transition ${
                        selected
                          ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600/40 dark:border-lime-500 dark:bg-lime-500/10 dark:ring-lime-500/30'
                          : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-mono text-xs font-bold uppercase text-slate-900 dark:text-slate-100">
                          {(s.description || s.name).toUpperCase()}
                        </span>
                        <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-lime-500 dark:text-slate-900">
                          {formatEur(s.priceRetailMonthly)}/ay
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {serverTypeShortSpecs(s)}
                      </p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <input
                className={cloudFieldClass}
                value={form.serverType}
                onChange={(e) => setForm({ ...form, serverType: e.target.value })}
                placeholder="cx23"
                required
              />
            )}

            {selectedSize && (
              <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Seçili:{' '}
                <strong>{(selectedSize.description || selectedSize.name).toUpperCase()}</strong>
                {' · '}
                maliyet {formatEur(selectedSize.priceProviderMonthly)} × 1.20 ={' '}
                <strong>{formatEur(selectedSize.priceRetailMonthly)}</strong>/ay
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
              Image
              {images.length ? (
                <select
                  className={cloudFieldClass}
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                >
                  {images.map((s) => (
                    <option key={s.id} value={s.name || s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={cloudFieldClass}
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="ubuntu-22.04"
                  required
                />
              )}
            </label>
            <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
              Region
              {regions.length ? (
                <select
                  className={cloudFieldClass}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                >
                  {regions.map((s) => (
                    <option key={s.id} value={s.name || s.id}>
                      {s.name || s.id}
                      {s.description ? ` — ${s.description}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={cloudFieldClass}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="nbg1"
                  required
                />
              )}
            </label>
          </div>

          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            SSH Key
            <select
              className={cloudFieldClass}
              value={form.sshKeyId}
              onChange={(e) => setForm({ ...form, sshKeyId: e.target.value })}
            >
              <option value="">Yok / sonra ekle</option>
              {sshKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            User-data / cloud-init
            <textarea
              className={`${cloudFieldClass} font-mono text-xs`}
              rows={4}
              placeholder={"#cloud-config\npackages:\n  - nginx"}
              value={form.userData}
              onChange={(e) => setForm({ ...form, userData: e.target.value })}
            />
          </label>
        </form>
      </CloudSlideOver>
    </div>
  )
}

export default CloudServersPage
