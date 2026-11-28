import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
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
  type VpsServerType,
  VPS_POPULAR_FALLBACK,
} from '../../lib/vpsCatalog'
import { useCurrency } from '@graphcore/shared'
import {
  CloudEmptyState,
  CloudError,
  CloudLoading,
  CloudPageHeader,
  CloudStatusPill,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudPanelClass,
  cloudTableWrap,
  cloudTd,
  cloudTh,
  cloudThead,
  cloudTr,
} from './cloudUi'
import CloudProvisionWizard, {
  type AppTemplate,
  type CatalogImage,
  type CatalogRegion,
  type Provider,
  type SshKey,
} from './CloudProvisionWizard'

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
  metadata?: Record<string, any>
  labels?: Record<string, string>
}

function serverMeta(r: ServerRow) {
  const m = r.metadata || {}
  return {
    cores: m.cores as number | undefined,
    memoryGb: m.memoryGb as number | undefined,
    diskGb: m.diskGb as number | undefined,
    bandwidthTb: m.bandwidthTb as number | undefined,
    weeklyBackups: Boolean(m.weeklyBackups),
    priceYearlyUsd: m.priceYearlyUsd as number | undefined,
    features: Array.isArray(m.features) ? (m.features as string[]) : [],
  }
}

const ADVANCED_ACTIONS: [string, string][] = [
  ['reset', 'Reset (hard)'],
  ['resize', 'Boyut değiştir'],
  ['rebuild', 'OS yeniden kur'],
  ['enable_rescue', 'Rescue aç'],
  ['disable_rescue', 'Rescue kapat'],
  ['rename', 'Yeniden adlandır'],
  ['labels', 'Etiketler'],
  ['change_protection', 'Silme koruması'],
  ['attach_iso', 'ISO bağla'],
  ['detach_iso', 'ISO ayır'],
  ['request_console', 'Konsol / VNC'],
  ['enable_backup', 'Yedek aç'],
  ['disable_backup', 'Yedek kapat'],
  ['metrics', 'Metrikler (stub)'],
]

const CloudServersPage: React.FC = () => {
  const { formatAmount, fxHint } = useCurrency()
  const [rows, setRows] = useState<ServerRow[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [sshKeys, setSshKeys] = useState<SshKey[]>([])
  const [images, setImages] = useState<CatalogImage[]>([])
  const [regions, setRegions] = useState<CatalogRegion[]>([])
  const [sizes, setSizes] = useState<VpsServerType[]>([])
  const [appTemplates, setAppTemplates] = useState<AppTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [catalogProviderId, setCatalogProviderId] = useState('')

  const loadCatalog = useCallback(async (providerId: string) => {
    if (!providerId) return
    setCatalogProviderId(providerId)
    try {
      const [img, reg, typ, apps] = await Promise.all([
        apiService.cloudCatalog('images', providerId).catch(() => ({ data: [] })),
        apiService.cloudCatalog('regions', providerId).catch(() => ({ data: [] })),
        apiService.cloudCatalog('server-types', providerId).catch(() => ({ data: [] })),
        apiService
          .cloudCatalog('app-templates', providerId)
          .catch(() => apiService.cloudAppTemplates('linux').catch(() => ({ data: [] }))),
      ])
      setImages(img.data || [])
      setRegions(reg.data || [])
      const types = (typ.data || []) as VpsServerType[]
      setSizes(types.length ? types : VPS_POPULAR_FALLBACK)
      setAppTemplates((apps.data || []) as AppTemplate[])
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
      const sortedProviders = [...(p.data || [])].sort((a, b) => {
        const rank = (slug: string) =>
          slug === 'hetzner' ? 0 : slug === 'managed' ? 1 : 2
        return rank(String(a.slug || '')) - rank(String(b.slug || ''))
      })
      setProviders(sortedProviders)
      setSshKeys(k.data || [])
      if (sortedProviders[0]) {
        const preferred =
          sortedProviders.find((x) => x.slug === 'hetzner') || sortedProviders[0]
        const pid = catalogProviderId || preferred.id
        await loadCatalog(pid)
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
  }, [catalogProviderId, loadCatalog])

  useEffect(() => {
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
        const serverType = window.prompt('Yeni sunucu tipi (örn. cx33)', 'cx33')
        if (!serverType) return
        body = { serverType }
      } else if (action === 'rebuild') {
        const image = window.prompt('Image (örn. ubuntu-22.04 veya windows-2022)', 'ubuntu-22.04')
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
      } else if (action === 'request_console' || action === 'console') {
        window.location.assign(`/cloud/servers/${id}`)
        return
      }
      await apiService.cloudServerAction(id, action, body)
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

  const windowsImageCount = images.filter((i) => {
    const f = `${i.osFamily || ''} ${i.osFlavor || ''} ${i.name || ''}`.toLowerCase()
    return f.includes('windows')
  }).length

  return (
    <div className="space-y-4">
      <CloudPageHeader
        title="Sunucular"
        description={`Çok adımlı provision · Linux / Windows · perakende ×1,20.${fxHint ? ` ${fxHint}` : ''}`}
        onRefresh={load}
        refreshing={loading}
        actions={
          <button type="button" onClick={() => setShowForm(true)} className={cloudBtnPrimary}>
            <Plus className="h-3.5 w-3.5" /> Sunucu oluştur
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
                description="Sihirbaz ile OS, konum, tip ve erişimi adım adım seçin. Windows Server image’ları katalogda."
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
                    {rows.map((r) => {
                      const win = /windows/i.test(
                        `${r.image || ''} ${(r.metadata as any)?.osFamily || ''} ${r.labels?.os_family || ''}`
                      )
                      const meta = serverMeta(r)
                      const cur = (r.currency || 'EUR').toUpperCase()
                      return (
                        <tr key={r.id} className={cloudTr}>
                          <td className={`${cloudTd} font-medium text-slate-900 dark:text-slate-100`}>
                            <Link
                              to={`/cloud/servers/${r.id}`}
                              className="hover:text-blue-700 hover:underline dark:hover:text-red-500"
                            >
                              {r.name}
                            </Link>
                            {win ? (
                              <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                                Win
                              </span>
                            ) : (
                              <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                Linux
                              </span>
                            )}
                          </td>
                          <td className={cloudTd}>
                            <CloudStatusPill status={r.status} />
                          </td>
                          <td className={`${cloudTd} text-xs text-slate-500 dark:text-slate-400`}>
                            <span className="font-mono text-[11px] uppercase text-slate-700 dark:text-slate-200">
                              {r.server_type || '—'}
                            </span>
                            <span className="mt-0.5 block">
                              {meta.cores
                                ? `${meta.cores} vCPU · ${meta.memoryGb} GB · ${meta.diskGb} GB NVMe`
                                : `${r.image || '—'} · ${r.location || '—'}`}
                            </span>
                            {meta.weeklyBackups && (
                              <span className="mt-0.5 block text-[10px] text-emerald-700 dark:text-emerald-400">
                                Ücretsiz haftalık yedek
                              </span>
                            )}
                          </td>
                          <td className={`${cloudTd} text-xs text-slate-600 dark:text-slate-300`}>
                            {r.price_retail != null ? (
                              <>
                                <span className="font-medium">
                                  {formatAmount(Number(r.price_retail), cur)}/ay
                                </span>
                                {meta.priceYearlyUsd != null ? (
                                  <span className="mt-0.5 block text-[10px] text-slate-400">
                                    ${meta.priceYearlyUsd}/yıl
                                  </span>
                                ) : r.cost_provider != null ? (
                                  <span className="mt-0.5 block text-[10px] text-slate-400">
                                    maliyet {formatAmount(Number(r.cost_provider), cur)}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className={`${cloudTd} font-mono text-xs`}>{r.ipv4 || '—'}</td>
                          <td className={cloudTd}>
                            <div className="flex flex-wrap items-center gap-0.5">
                              <Link
                                to={`/cloud/servers/${r.id}`}
                                title="Detay / Konsol"
                                className="rounded px-1.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 dark:text-red-500 dark:hover:bg-red-600/10"
                              >
                                Detay
                              </Link>
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
                      )
                    })}
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
                  <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-red-500">
                    {runningCount}
                  </p>
                  <p className="text-[11px] text-slate-500">Çalışan</p>
                </div>
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800">
                <p>
                  Sağlayıcı:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {providers.length}
                  </span>
                </p>
                <p className="mt-1">
                  Windows image:{' '}
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {windowsImageCount}
                  </span>
                </p>
              </div>
            </div>

            <div className={`${cloudPanelClass} p-4`}>
              <div className="flex items-center gap-2">
                <Cpu className="h-3.5 w-3.5 text-blue-700 dark:text-red-500" />
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
                    <span className="shrink-0 font-semibold text-blue-800 dark:text-red-500">
                      {formatAmount(s.priceRetailMonthly, 'EUR')}
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
                Sihirbazı aç
              </button>
            </div>
          </aside>
        </div>
      )}

      <CloudProvisionWizard
        open={showForm}
        onClose={() => {
          setShowForm(false)
          load()
        }}
        providers={providers}
        sshKeys={sshKeys}
        images={images}
        regions={regions}
        sizes={sizes}
        appTemplates={appTemplates}
        initialProviderId={catalogProviderId || providers[0]?.id}
        onProviderChange={(pid) => loadCatalog(pid)}
        onCreated={() => load()}
      />
    </div>
  )
}

export default CloudServersPage
