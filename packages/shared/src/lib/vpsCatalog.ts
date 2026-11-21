/**
 * Shared VPS catalog types + EUR formatters for marketing / Cloud UI.
 * Retail = Hetzner list × 1.20 (documented in docs/cloud/PRICING.md).
 */

export type VpsServerType = {
  id?: string
  name: string
  description?: string
  descriptionTr?: string
  family?: string
  familyLabel?: string
  useCaseHint?: string
  trafficTb?: number | null
  cpuKind?: string
  architecture?: string
  cores?: number | null
  memory?: number | null
  memoryGb?: number | null
  disk?: number | null
  diskGb?: number | null
  popular?: boolean
  currency?: string
  priceProviderMonthly?: number | null
  priceRetailMonthly?: number | null
  markup?: number
}

export type VpsFamilyMeta = {
  id: string
  code?: string
  label: string
  familyLabel?: string
  hint: string
  descriptionTr?: string
}

export type VpsCatalog = {
  currency: string
  markup: number
  markupNote?: string
  families?: VpsFamilyMeta[]
  popularPlans?: VpsServerType[]
  serverTypes?: VpsServerType[]
  storage?: {
    volumePerGb?: { provider: number; retail: number }
    snapshotPerGb?: { provider: number; retail: number }
    primaryIpv4?: { provider: number; retail: number }
  }
  locations?: { name: string; description?: string; country?: string }[]
}

/** Family labels for wizard / catalog UI (Turkish). */
export const SIZE_FAMILIES: readonly VpsFamilyMeta[] = [
  {
    id: 'cx',
    code: 'CX',
    label: 'CX',
    familyLabel: 'CX — Uygun maliyet / genel amaç',
    hint: 'Paylaşımlı · Intel',
    descriptionTr:
      'Paylaşımlı Intel vCPU. Web, staging ve hafif uygulamalar için ekonomik seçenek.',
  },
  {
    id: 'cpx',
    code: 'CPX',
    label: 'CPX',
    familyLabel: 'CPX — Daha yüksek performans',
    hint: 'Paylaşımlı · AMD',
    descriptionTr:
      'Paylaşımlı AMD vCPU. Daha fazla disk ve daha yüksek performans ihtiyacı için.',
  },
  {
    id: 'cax',
    code: 'CAX',
    label: 'CAX',
    familyLabel: 'CAX — ARM, fiyat/performans',
    hint: 'ARM · Ampere',
    descriptionTr:
      'Ampere ARM mimarisi. Bulut-native iş yüklerinde güçlü fiyat/performans.',
  },
  {
    id: 'ccx',
    code: 'CCX',
    label: 'CCX',
    familyLabel: 'CCX — Dedicated vCPU, üretim',
    hint: 'Dedicated vCPU',
    descriptionTr:
      'Ayrılmış (dedicated) vCPU. Üretim, veritabanı ve tutarlı performans gereken iş yükleri.',
  },
] as const

const USE_CASE_FALLBACK: Record<string, string> = {
  cx23: 'Küçük web sitesi, blog veya staging',
  cx33: 'Orta ölçekli web / API sunucusu',
  cx43: 'Çoklu uygulama veya orta trafik',
  cx53: 'Yoğun web / mikroservis hostu',
  cax11: 'ARM uyumlu küçük servisler',
  cax21: 'ARM web / container iş yükleri',
  cax31: 'Ölçeklenen ARM uygulamaları',
  cax41: 'Büyük ARM cluster düğümü',
  cpx22: 'Daha hızlı diskli küçük üretim',
  cpx32: 'Orta üretim / uygulama sunucusu',
  cpx42: 'Yoğun uygulama veya CI worker',
  cpx52: 'Yüksek trafikli uygulama katmanı',
  cpx62: 'Büyük paylaşımlı üretim düğümü',
  ccx13: 'Küçük DB / kritik mikroservis',
  ccx23: 'Orta veritabanı veya üretim API',
  ccx33: 'Yüksek yüklü üretim servisleri',
  ccx43: 'Büyük DB / mesaj kuyruğu',
  ccx53: 'Kurumsal üretim / analytics',
  ccx63: 'En yüksek dedicated kapasite',
}

/** Offline fallback — mirrors backend seed (Jun 2026 EU, +20%) */
export const VPS_POPULAR_FALLBACK: VpsServerType[] = [
  {
    name: 'cx23',
    description: 'CX23',
    family: 'cx',
    familyLabel: 'CX — Uygun maliyet / genel amaç',
    descriptionTr:
      'Paylaşımlı Intel vCPU. Web, staging ve hafif uygulamalar için ekonomik seçenek.',
    useCaseHint: USE_CASE_FALLBACK.cx23,
    trafficTb: 20,
    cores: 2,
    memoryGb: 4,
    diskGb: 40,
    priceProviderMonthly: 5.49,
    priceRetailMonthly: 6.59,
    currency: 'EUR',
    popular: true,
  },
  {
    name: 'cx33',
    description: 'CX33',
    family: 'cx',
    familyLabel: 'CX — Uygun maliyet / genel amaç',
    descriptionTr:
      'Paylaşımlı Intel vCPU. Web, staging ve hafif uygulamalar için ekonomik seçenek.',
    useCaseHint: USE_CASE_FALLBACK.cx33,
    trafficTb: 20,
    cores: 4,
    memoryGb: 8,
    diskGb: 80,
    priceProviderMonthly: 8.49,
    priceRetailMonthly: 10.19,
    currency: 'EUR',
    popular: true,
  },
  {
    name: 'cax11',
    description: 'CAX11',
    family: 'cax',
    familyLabel: 'CAX — ARM, fiyat/performans',
    descriptionTr:
      'Ampere ARM mimarisi. Bulut-native iş yüklerinde güçlü fiyat/performans.',
    useCaseHint: USE_CASE_FALLBACK.cax11,
    trafficTb: 20,
    cores: 2,
    memoryGb: 4,
    diskGb: 40,
    priceProviderMonthly: 5.99,
    priceRetailMonthly: 7.19,
    currency: 'EUR',
    popular: true,
  },
  {
    name: 'cpx22',
    description: 'CPX22',
    family: 'cpx',
    familyLabel: 'CPX — Daha yüksek performans',
    descriptionTr:
      'Paylaşımlı AMD vCPU. Daha fazla disk ve daha yüksek performans ihtiyacı için.',
    useCaseHint: USE_CASE_FALLBACK.cpx22,
    trafficTb: 20,
    cores: 2,
    memoryGb: 4,
    diskGb: 80,
    priceProviderMonthly: 19.49,
    priceRetailMonthly: 23.39,
    currency: 'EUR',
    popular: true,
  },
  {
    name: 'ccx13',
    description: 'CCX13',
    family: 'ccx',
    familyLabel: 'CCX — Dedicated vCPU, üretim',
    descriptionTr:
      'Ayrılmış (dedicated) vCPU. Üretim, veritabanı ve tutarlı performans gereken iş yükleri.',
    useCaseHint: USE_CASE_FALLBACK.ccx13,
    trafficTb: 20,
    cores: 2,
    memoryGb: 8,
    diskGb: 80,
    priceProviderMonthly: 42.99,
    priceRetailMonthly: 51.59,
    currency: 'EUR',
    popular: true,
  },
]

export function formatEur(amount: number | null | undefined) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount))
}

export function getFamilyMeta(familyOrName?: string | null): VpsFamilyMeta | null {
  if (!familyOrName) return null
  const key = familyOrName.toLowerCase()
  const byId = SIZE_FAMILIES.find((f) => f.id === key)
  if (byId) return byId
  if (key.startsWith('cax')) return SIZE_FAMILIES.find((f) => f.id === 'cax') || null
  if (key.startsWith('ccx')) return SIZE_FAMILIES.find((f) => f.id === 'ccx') || null
  if (key.startsWith('cpx')) return SIZE_FAMILIES.find((f) => f.id === 'cpx') || null
  if (key.startsWith('cx')) return SIZE_FAMILIES.find((f) => f.id === 'cx') || null
  return null
}

export function familyDisplayLabel(s: VpsServerType) {
  if (s.familyLabel) return s.familyLabel
  const meta = getFamilyMeta(s.family || s.name)
  return meta?.familyLabel || meta?.label || (s.family || '').toUpperCase() || '—'
}

export function useCaseHintFor(s: VpsServerType) {
  if (s.useCaseHint) return s.useCaseHint
  const key = String(s.name || s.id || '').toLowerCase()
  return USE_CASE_FALLBACK[key] || null
}

export function serverTypeLabel(s: VpsServerType) {
  const mem = s.memoryGb ?? s.memory
  const disk = s.diskGb ?? s.disk
  const specs = [
    s.cores != null ? `${s.cores} vCPU` : null,
    mem != null ? `${mem} GB RAM` : null,
    disk != null ? `${disk} GB disk` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const price =
    s.priceRetailMonthly != null
      ? ` · ${formatEur(s.priceRetailMonthly)}/ay`
      : ''
  return `${(s.description || s.name).toUpperCase()}${specs ? ` — ${specs}` : ''}${price}`
}

export function serverTypeShortSpecs(s: VpsServerType) {
  const mem = s.memoryGb ?? s.memory
  const disk = s.diskGb ?? s.disk
  const parts = [
    `${s.cores ?? '—'} vCPU`,
    `${mem ?? '—'} GB RAM`,
    `${disk ?? '—'} GB disk`,
  ]
  if (s.trafficTb != null) parts.push(`${s.trafficTb} TB trafik`)
  return parts.join(' · ')
}
