/**
 * Shared VPS catalog types + EUR formatters for marketing / Cloud UI.
 * Retail = Hetzner list × 1.20 (documented in docs/cloud/PRICING.md).
 */

export type VpsServerType = {
  id?: string
  name: string
  description?: string
  family?: string
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

export type VpsCatalog = {
  currency: string
  markup: number
  markupNote?: string
  popularPlans?: VpsServerType[]
  serverTypes?: VpsServerType[]
  storage?: {
    volumePerGb?: { provider: number; retail: number }
    snapshotPerGb?: { provider: number; retail: number }
    primaryIpv4?: { provider: number; retail: number }
  }
  locations?: { name: string; description?: string; country?: string }[]
}

/** Offline fallback — mirrors backend seed (Jun 2026 EU, +20%) */
export const VPS_POPULAR_FALLBACK: VpsServerType[] = [
  {
    name: 'cx23',
    description: 'CX23',
    family: 'cx',
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

export function serverTypeLabel(s: VpsServerType) {
  const mem = s.memoryGb ?? s.memory
  const disk = s.diskGb ?? s.disk
  const specs = [
    s.cores != null ? `${s.cores} vCPU` : null,
    mem != null ? `${mem} GB RAM` : null,
    disk != null ? `${disk} GB` : null,
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
  return `${s.cores ?? '—'} vCPU / ${mem ?? '—'} GB / ${disk ?? '—'} GB`
}
