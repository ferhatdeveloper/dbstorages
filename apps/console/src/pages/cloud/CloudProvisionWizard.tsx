import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Monitor,
  Server,
  Shield,
  Terminal,
} from 'lucide-react'
import { apiService } from '../../services/api'
import {
  formatEur,
  serverTypeShortSpecs,
  useCaseHintFor,
  type VpsServerType,
} from '../../lib/vpsCatalog'
import {
  CloudSlideOver,
  SIZE_FAMILIES,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudFieldClass,
  detectSizeFamily,
} from './cloudUi'

export type CatalogImage = {
  id: string
  name?: string
  description?: string
  osFlavor?: string
  osFamily?: string
}

export type CatalogRegion = { id: string; name?: string; description?: string; city?: string; country?: string }
export type Provider = { id: string; name: string; slug: string }
export type SshKey = { id: string; name: string; external_id?: string }

type FormState = {
  providerId: string
  name: string
  osFamily: 'linux' | 'windows'
  serverType: string
  image: string
  location: string
  sshKeyId: string
  userData: string
  enableIpv4: boolean
  enableIpv6: boolean
  windowsPasswordNoteAck: boolean
}

type ProgressPhase = 'idle' | 'pending' | 'running' | 'ip' | 'console' | 'done' | 'failed'

const STEPS = [
  {
    id: 1,
    title: 'İşletim sistemi',
    description: 'Linux veya Windows Server seçin. Image kataloğu buna göre filtrelenir.',
  },
  {
    id: 2,
    title: 'Konum',
    description: 'Sunucunun çalışacağı veri merkezi / bölge.',
  },
  {
    id: 3,
    title: 'Tip ve fiyat',
    description:
      'Sunucu ailesini seçin (CX / CPX / CAX / CCX). Perakende = sağlayıcı × 1,20 EUR (KDV hariç).',
  },
  {
    id: 4,
    title: 'Ağ ve erişim',
    description: 'IPv4/IPv6 ve Linux için SSH; Windows için parola / RDP notları.',
  },
  {
    id: 5,
    title: 'Özet ve oluştur',
    description: 'Seçimleri kontrol edin; oluşturma asenkron ilerler.',
  },
] as const

function isWindowsImage(img: CatalogImage) {
  const family = String(img.osFamily || img.osFlavor || '').toLowerCase()
  const blob = `${img.name || ''} ${img.description || ''}`.toLowerCase()
  return family === 'windows' || blob.includes('windows')
}

function progressSteps(phase: ProgressPhase) {
  const order: ProgressPhase[] = ['pending', 'running', 'ip', 'console', 'done']
  const idx = order.indexOf(phase === 'failed' ? 'pending' : phase)
  return [
    { key: 'pending', label: 'Kuyrukta (pending)' },
    { key: 'running', label: 'Oluşturuluyor / çalışıyor' },
    { key: 'ip', label: 'IP hazır' },
    { key: 'console', label: 'Konsol kullanılabilir' },
    { key: 'done', label: 'Tamamlandı' },
  ].map((s, i) => ({
    ...s,
    state: phase === 'failed' && i === 0 ? 'failed' : i < idx ? 'done' : i === idx ? 'active' : 'todo',
  }))
}

type Props = {
  open: boolean
  onClose: () => void
  providers: Provider[]
  sshKeys: SshKey[]
  images: CatalogImage[]
  regions: CatalogRegion[]
  sizes: VpsServerType[]
  initialProviderId?: string
  onCreated: (serverId: string) => void
  onProviderChange: (providerId: string) => void
}

const CloudProvisionWizard: React.FC<Props> = ({
  open,
  onClose,
  providers,
  sshKeys,
  images,
  regions,
  sizes,
  initialProviderId,
  onCreated,
  onProviderChange,
}) => {
  const [step, setStep] = useState(1)
  const [sizeFamily, setSizeFamily] = useState('cx')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [opId, setOpId] = useState<string | null>(null)
  const [phase, setPhase] = useState<ProgressPhase>('idle')
  const [rootPasswordHint, setRootPasswordHint] = useState<string | null>(null)

  const [form, setForm] = useState<FormState>({
    providerId: initialProviderId || '',
    name: '',
    osFamily: 'linux',
    serverType: 'cx23',
    image: 'ubuntu-22.04',
    location: 'nbg1',
    sshKeyId: '',
    userData: '',
    enableIpv4: true,
    enableIpv6: true,
    windowsPasswordNoteAck: false,
  })

  useEffect(() => {
    if (!open) return
    setStep(1)
    setSaving(false)
    setError('')
    setCreatedId(null)
    setOpId(null)
    setPhase('idle')
    setRootPasswordHint(null)
    setForm((f) => ({
      ...f,
      providerId: initialProviderId || providers[0]?.id || f.providerId,
      name: '',
      sshKeyId: '',
      userData: '',
      windowsPasswordNoteAck: false,
    }))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (form.providerId) onProviderChange(form.providerId)
  }, [form.providerId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredImages = useMemo(() => {
    const list = images.filter((img) =>
      form.osFamily === 'windows' ? isWindowsImage(img) : !isWindowsImage(img)
    )
    return list.length ? list : images
  }, [images, form.osFamily])

  useEffect(() => {
    if (!filteredImages.length) return
    const currentOk = filteredImages.some(
      (i) => (i.name || i.id) === form.image
    )
    if (!currentOk) {
      const first = filteredImages[0]
      setForm((f) => ({ ...f, image: String(first.name || first.id) }))
    }
  }, [filteredImages, form.image])

  useEffect(() => {
    if (!regions.length) return
    const ok = regions.some((r) => (r.name || r.id) === form.location)
    if (!ok) {
      setForm((f) => ({
        ...f,
        location: String(regions[0].name || regions[0].id),
      }))
    }
  }, [regions, form.location])

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
      .map((id) => ({
        id,
        label: id.toUpperCase(),
        familyLabel: id.toUpperCase(),
        hint: '',
        descriptionTr: '',
      }))
    const other =
      (sizesByFamily.other || []).length > 0
        ? [
            {
              id: 'other',
              label: 'Diğer',
              familyLabel: 'Diğer tipler',
              hint: '',
              descriptionTr: '',
            },
          ]
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
    if (!createdId || phase === 'done' || phase === 'failed') return
    let cancelled = false
    const tick = async () => {
      try {
        const res = await apiService.cloudGetServer(createdId)
        const s = res.data
        if (!s || cancelled) return
        const st = String(s.status || '').toLowerCase()
        const hasIp = Boolean(s.ipv4 || s.ipv6)
        const consoleReady = Boolean(s.metadata?.console?.wssUrl)
        if (st === 'failed' || st === 'error') {
          setPhase('failed')
          return
        }
        if (consoleReady) {
          setPhase('done')
        } else if (hasIp && ['running', 'active', 'online'].includes(st)) {
          setPhase('console')
        } else if (hasIp) {
          setPhase('ip')
        } else if (st === 'pending') {
          setPhase('pending')
        } else {
          setPhase('running')
        }
        if (opId) {
          try {
            const op = await apiService.cloudGetOperation(opId)
            const row = (op as any).data
            const result = row?.result || {}
            if (result?.rootPassword) setRootPasswordHint(String(result.rootPassword))
            const opStatus = String(row?.status || '').toLowerCase()
            if (opStatus === 'failed' || opStatus === 'error') {
              setPhase('failed')
              setError(row?.error || 'Oluşturma başarısız')
            }
          } catch {
            /* ignore */
          }
        }
      } catch {
        /* ignore poll errors */
      }
    }
    tick()
    const id = window.setInterval(tick, 2000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [createdId, opId, phase])

  const canNext = () => {
    if (step === 1) return Boolean(form.providerId && form.osFamily && form.image)
    if (step === 2) return Boolean(form.location)
    if (step === 3) return Boolean(form.serverType && form.name.trim())
    if (step === 4) {
      if (form.osFamily === 'windows') return form.windowsPasswordNoteAck
      return true
    }
    return true
  }

  const submit = async () => {
    setSaving(true)
    setError('')
    setPhase('pending')
    try {
      const selectedKey = sshKeys.find((k) => k.id === form.sshKeyId)
      const res = await apiService.cloudCreateServer({
        providerId: form.providerId,
        name: form.name.trim(),
        serverType: form.serverType,
        image: form.image,
        location: form.location,
        userData: form.osFamily === 'linux' ? form.userData || undefined : undefined,
        sshKeys:
          form.osFamily === 'linux'
            ? selectedKey?.external_id
              ? [selectedKey.external_id]
              : form.sshKeyId
                ? [form.sshKeyId]
                : undefined
            : undefined,
        enableIpv4: form.enableIpv4,
        enableIpv6: form.enableIpv6,
        labels: { os_family: form.osFamily },
      })
      const serverId = String((res as any).data?.id || (res as any).data?.server?.id || '')
      const operationId = String(
        (res as any).operationId || (res as any).data?.operation?.id || ''
      )
      if (!serverId) throw new Error('Sunucu kimliği alınamadı')
      setCreatedId(serverId)
      setOpId(operationId || null)
      setPhase('running')
      onCreated(serverId)
    } catch (err: any) {
      setPhase('failed')
      setError(err.message || 'Oluşturma başarısız')
    } finally {
      setSaving(false)
    }
  }

  const close = () => {
    onClose()
  }

  const footer =
    phase !== 'idle' && createdId ? (
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={close} className={cloudBtnGhost}>
          Listeye dön
        </button>
        <Link to={`/cloud/servers/${createdId}`} className={cloudBtnPrimary} onClick={close}>
          Sunucu detayı
        </Link>
      </div>
    ) : (
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => (step === 1 ? close() : setStep((s) => s - 1))}
          className={cloudBtnGhost}
          disabled={saving}
        >
          {step === 1 ? (
            'İptal'
          ) : (
            <>
              <ChevronLeft className="h-3.5 w-3.5" /> Geri
            </>
          )}
        </button>
        {step < 5 ? (
          <button
            type="button"
            disabled={!canNext() || !providers.length}
            onClick={() => setStep((s) => s + 1)}
            className={cloudBtnPrimary + ' min-w-[8rem]'}
          >
            İleri <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || !providers.length || !canNext()}
            onClick={submit}
            className={cloudBtnPrimary + ' min-w-[10rem]'}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Oluştur (async)'}
          </button>
        )}
      </div>
    )

  const current = STEPS[step - 1]

  return (
    <CloudSlideOver
      open={open}
      onClose={close}
      title="Sunucu oluşturma sihirbazı"
      subtitle={`${current.title} · adım ${Math.min(step, 5)}/5`}
      wide
      footer={footer}
    >
      <div className="mb-4 flex flex-wrap gap-1.5">
        {STEPS.map((s) => (
          <div
            key={s.id}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold ${
              s.id === step
                ? 'bg-teal-700 text-white dark:bg-lime-500 dark:text-slate-900'
                : s.id < step
                  ? 'bg-teal-50 text-teal-800 dark:bg-lime-500/15 dark:text-lime-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {s.id < step ? <Check className="h-3 w-3" /> : <span>{s.id}</span>}
            <span className="hidden sm:inline">{s.title}</span>
          </div>
        ))}
      </div>

      <p className="mb-4 rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
        {current.description}
      </p>

      {error && (
        <p className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {!providers.length && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Önce Providers sekmesinden provider ekleyin.
        </p>
      )}

      {createdId && phase !== 'idle' ? (
        <div className="space-y-4">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            Oluşturma ilerlemesi
          </p>
          <ol className="space-y-2">
            {progressSteps(phase).map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    s.state === 'done'
                      ? 'bg-emerald-500 text-white'
                      : s.state === 'active'
                        ? 'bg-sky-500 text-white'
                        : s.state === 'failed'
                          ? 'bg-red-500 text-white'
                          : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                  }`}
                >
                  {s.state === 'active' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : s.state === 'done' ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    '·'
                  )}
                </span>
                <span className="text-slate-700 dark:text-slate-200">{s.label}</span>
              </li>
            ))}
          </ol>
          {rootPasswordHint && (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 font-mono text-[11px] text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              İlk parola (bir kez gösterilir): {rootPasswordHint}
            </p>
          )}
          <p className="text-[11px] text-slate-500">
            Detay sayfasında konsol paneli ve kurulum sonrası kontrol listesi hazır.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {step === 1 && (
            <>
              <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
                Sağlayıcı
                <select
                  className={cloudFieldClass}
                  value={form.providerId}
                  onChange={(e) => setForm({ ...form, providerId: e.target.value })}
                  required
                >
                  <option value="">Sağlayıcı seçin</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: 'linux' as const,
                      title: 'Linux',
                      hint: 'Ubuntu, Debian, Alma, Rocky… SSH ile erişim',
                      icon: <Terminal className="h-5 w-5" />,
                    },
                    {
                      id: 'windows' as const,
                      title: 'Windows Server',
                      hint: '2022 / 2019 · RDP 3389 · Administrator parolası',
                      icon: <Monitor className="h-5 w-5" />,
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setForm({ ...form, osFamily: opt.id })}
                    className={`rounded-lg border p-3 text-left transition ${
                      form.osFamily === opt.id
                        ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600/40 dark:border-lime-500 dark:bg-lime-500/10'
                        : 'border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="text-teal-800 dark:text-lime-400">{opt.icon}</div>
                    <p className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {opt.title}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{opt.hint}</p>
                  </button>
                ))}
              </div>

              <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
                Image ({form.osFamily === 'windows' ? 'Windows' : 'Linux'})
                {filteredImages.length ? (
                  <select
                    className={cloudFieldClass}
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                  >
                    {filteredImages.map((s) => (
                      <option key={s.id} value={s.name || s.id}>
                        {s.description || s.name || s.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={cloudFieldClass}
                    value={form.image}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                    placeholder={
                      form.osFamily === 'windows' ? 'windows-2022' : 'ubuntu-22.04'
                    }
                  />
                )}
              </label>
            </>
          )}

          {step === 2 && (
            <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
              Konum / bölge
              {regions.length ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {regions.map((r) => {
                    const value = String(r.name || r.id)
                    const selected = form.location === value
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setForm({ ...form, location: value })}
                        className={`rounded-lg border p-3 text-left text-sm transition ${
                          selected
                            ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600/40 dark:border-lime-500 dark:bg-lime-500/10'
                            : 'border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        <span className="font-mono text-xs font-bold uppercase">
                          {value}
                        </span>
                        <span className="mt-1 block text-[11px] text-slate-500">
                          {r.description || r.city || r.country || '—'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <input
                  className={cloudFieldClass}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="nbg1"
                />
              )}
            </label>
          )}

          {step === 3 && (
            <>
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
                  Sunucu tipi (aileye göre · perakende ×1,20)
                </p>
                <div className="mb-3 flex flex-wrap gap-1">
                  {familyTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSizeFamily(tab.id)}
                      title={tab.descriptionTr || tab.hint}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                        sizeFamily === tab.id
                          ? 'bg-teal-700 text-white dark:bg-lime-500 dark:text-slate-900'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <span>{tab.label}</span>
                      {tab.hint ? (
                        <span className="ml-1 hidden font-normal opacity-80 sm:inline">
                          · {tab.hint}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="max-h-72 space-y-4 overflow-y-auto pr-0.5">
                  {familyTabs
                    .filter((tab) => tab.id === sizeFamily)
                    .map((tab) => {
                      const list =
                        sizesByFamily[tab.id] ||
                        (tab.id === sizeFamily ? visibleSizes : []) ||
                        []
                      if (!list.length) return null
                      return (
                        <section key={tab.id}>
                          <header className="mb-2">
                            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              {tab.familyLabel || tab.label}
                            </h4>
                            {(tab.descriptionTr || tab.hint) && (
                              <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                                {tab.descriptionTr || tab.hint}
                              </p>
                            )}
                          </header>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {list.map((s) => {
                              const value = s.name || s.id || ''
                              const selected = form.serverType === value
                              const hint = useCaseHintFor(s)
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() =>
                                    setForm({ ...form, serverType: value })
                                  }
                                  className={`rounded-lg border p-3 text-left transition ${
                                    selected
                                      ? 'border-teal-600 bg-teal-50 ring-1 ring-teal-600/40 dark:border-lime-500 dark:bg-lime-500/10'
                                      : 'border-slate-200 dark:border-slate-700'
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="font-mono text-xs font-bold uppercase">
                                      {(s.description || s.name).toUpperCase()}
                                    </span>
                                    <span className="shrink-0 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-lime-500 dark:text-slate-900">
                                      {formatEur(s.priceRetailMonthly)}/ay
                                    </span>
                                  </div>
                                  <p className="mt-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                                    {serverTypeShortSpecs(s)}
                                  </p>
                                  {hint ? (
                                    <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">
                                      {hint}
                                    </p>
                                  ) : null}
                                </button>
                              )
                            })}
                          </div>
                        </section>
                      )
                    })}
                </div>
                {selectedSize && (
                  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Maliyet {formatEur(selectedSize.priceProviderMonthly)} × 1,20 ={' '}
                    <strong>{formatEur(selectedSize.priceRetailMonthly)}</strong>
                    /ay
                    {useCaseHintFor(selectedSize)
                      ? ` · ${useCaseHintFor(selectedSize)}`
                      : ''}
                  </p>
                )}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.enableIpv4}
                    onChange={(e) => setForm({ ...form, enableIpv4: e.target.checked })}
                  />
                  IPv4 etkin
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.enableIpv6}
                    onChange={(e) => setForm({ ...form, enableIpv6: e.target.checked })}
                  />
                  IPv6 etkin
                </label>
              </div>

              {form.osFamily === 'linux' ? (
                <>
                  <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
                    SSH anahtarı
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
                    User-data / cloud-init (isteğe bağlı)
                    <textarea
                      className={`${cloudFieldClass} font-mono text-xs`}
                      rows={4}
                      placeholder={'#cloud-config\npackages:\n  - nginx'}
                      value={form.userData}
                      onChange={(e) => setForm({ ...form, userData: e.target.value })}
                    />
                  </label>
                </>
              ) : (
                <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-teal-700 dark:text-lime-400" />
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      <p className="font-semibold text-slate-800 dark:text-slate-100">
                        Windows erişim notları
                      </p>
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        <li>
                          Administrator parolası sağlayıcı tarafından bir kez üretilir (oluşturma
                          sonucu / Activity).
                        </li>
                        <li>
                          Uzak masaüstü (RDP) için TCP <strong>3389</strong> firewall kuralı
                          gerekir.
                        </li>
                        <li>
                          Web konsol / VNC sunucu detayındaki Konsol panelinden açılır; RDP için
                          IP:3389 kullanın.
                        </li>
                        <li>Parola kaybolursa rescue / reset işlemlerini detay checklist’ten izleyin.</li>
                      </ul>
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={form.windowsPasswordNoteAck}
                      onChange={(e) =>
                        setForm({ ...form, windowsPasswordNoteAck: e.target.checked })
                      }
                    />
                    Windows parola ve RDP notlarını okudum; devam edebilirim.
                  </label>
                </div>
              )}
            </>
          )}

          {step === 5 && (
            <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                <Server className="h-4 w-4" /> Özet
              </div>
              <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-1.5">
                <dt className="text-slate-400">Ad</dt>
                <dd className="font-medium">{form.name || '—'}</dd>
                <dt className="text-slate-400">OS</dt>
                <dd>
                  {form.osFamily === 'windows' ? 'Windows Server' : 'Linux'} · {form.image}
                </dd>
                <dt className="text-slate-400">Konum</dt>
                <dd>{form.location}</dd>
                <dt className="text-slate-400">Tip</dt>
                <dd>
                  <span className="font-mono uppercase">{form.serverType}</span>
                  {selectedSize?.familyLabel ? (
                    <span className="block text-[11px] text-slate-500">
                      {selectedSize.familyLabel}
                    </span>
                  ) : null}
                  {selectedSize ? (
                    <span className="block text-[11px] text-slate-500">
                      {serverTypeShortSpecs(selectedSize)}
                      {useCaseHintFor(selectedSize)
                        ? ` · ${useCaseHintFor(selectedSize)}`
                        : ''}
                    </span>
                  ) : null}
                </dd>
                <dt className="text-slate-400">Fiyat</dt>
                <dd>
                  {selectedSize
                    ? `${formatEur(selectedSize.priceRetailMonthly)}/ay (×1,20)`
                    : '—'}
                </dd>
                <dt className="text-slate-400">Ağ</dt>
                <dd>
                  IPv4 {form.enableIpv4 ? 'açık' : 'kapalı'} · IPv6{' '}
                  {form.enableIpv6 ? 'açık' : 'kapalı'}
                </dd>
                <dt className="text-slate-400">Erişim</dt>
                <dd>
                  {form.osFamily === 'windows'
                    ? 'RDP / web konsol · parola oluşturma sonrası'
                    : form.sshKeyId
                      ? `SSH anahtarı seçili`
                      : 'SSH sonra eklenebilir'}
                </dd>
              </dl>
              <p className="rounded-md bg-slate-50 px-3 py-2 text-[11px] dark:bg-slate-800">
                Oluştur’a basınca işlem kuyruğa alınır: pending → running → IP hazır → konsol
                kullanılabilir. İlerlemeyi bu ekranda ve sunucu detayında izlersiniz.
              </p>
            </div>
          )}
        </div>
      )}
    </CloudSlideOver>
  )
}

export default CloudProvisionWizard
