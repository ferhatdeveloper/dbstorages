export type DbPlan = {
  id: string
  name: string
  priceCents: number
  priceYearCents?: number
  currency: string
  interval: string
  vcpu: number
  ramMb: number
  diskGb: number
  storageGb?: number
  connections: number
  highlight?: boolean
  description: string
  features?: string[]
}

/** Kademeli merdiven. Yıllık fiyat ana referans; aylık ≈ yıl / 12. */
export const FALLBACK_DB_PLANS: DbPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceCents: 1250,
    priceYearCents: 15000,
    currency: 'usd',
    interval: 'month',
    vcpu: 1,
    ramMb: 2048,
    diskGb: 20,
    storageGb: 5,
    connections: 50,
    description: 'Basic başlangıç — küçük projeler ve ilk adımlar.',
    features: [
      '1 vCPU · 2 GB RAM',
      '20 GB veritabanı diski',
      '5 GB object storage',
      '50 eşzamanlı bağlantı',
      '3 gün yedek saklama',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3333,
    priceYearCents: 40000,
    currency: 'usd',
    interval: 'month',
    vcpu: 2,
    ramMb: 4096,
    diskGb: 50,
    storageGb: 20,
    connections: 150,
    highlight: true,
    description: 'Starter’ın bir üstü — dengeli küçük üretim.',
    features: [
      '2 vCPU · 4 GB RAM',
      '50 GB veritabanı diski',
      '20 GB object storage',
      '150 eşzamanlı bağlantı',
      '7 gün yedek saklama',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    priceCents: 5000,
    priceYearCents: 60000,
    currency: 'usd',
    interval: 'month',
    vcpu: 4,
    ramMb: 8192,
    diskGb: 120,
    storageGb: 50,
    connections: 400,
    description: 'Pro’nun bir üstü — büyüyen ekipler ve trafik.',
    features: [
      '4 vCPU · 8 GB RAM',
      '120 GB veritabanı diski',
      '50 GB object storage',
      '400 eşzamanlı bağlantı',
      '14 gün yedek saklama',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    priceCents: 7500,
    priceYearCents: 90000,
    currency: 'usd',
    interval: 'month',
    vcpu: 8,
    ramMb: 24576,
    diskGb: 250,
    storageGb: 120,
    connections: 1000,
    description: 'Scale’in bir üstü — yüksek yük ve daha uzun yedek.',
    features: [
      '8 vCPU · 24 GB RAM',
      '250 GB veritabanı diski',
      '120 GB object storage',
      '1000 eşzamanlı bağlantı',
      '30 gün yedek saklama',
    ],
  },
  {
    id: 'maxplus',
    name: 'Max+',
    priceCents: 10000,
    priceYearCents: 120000,
    currency: 'usd',
    interval: 'month',
    vcpu: 12,
    ramMb: 49152,
    diskGb: 400,
    storageGb: 250,
    connections: 2000,
    description: 'Max’in bir üstü — en geniş disk, storage ve bağlantı.',
    features: [
      '12 vCPU · 48 GB RAM',
      '400 GB veritabanı diski',
      '250 GB object storage',
      '2000 eşzamanlı bağlantı',
      '45 gün yedek saklama',
    ],
  },
]

export function mergeDbPlansFromApi(apiPlans: DbPlan[]): DbPlan[] {
  if (!apiPlans?.length) return FALLBACK_DB_PLANS
  const fbById = new Map(FALLBACK_DB_PLANS.map((p) => [p.id, p]))
  const ids = [
    ...FALLBACK_DB_PLANS.map((p) => p.id),
    ...apiPlans
      .map((p) => p.id)
      .filter((id) => id !== 'free' && !fbById.has(id)),
  ]
  return ids.map((id) => {
    const fb = fbById.get(id)
    const api = apiPlans.find((p) => p.id === id)
    if (!fb && api) {
      return {
        ...api,
        priceYearCents: api.priceYearCents ?? (api.priceCents || 0) * 12,
      }
    }
    if (!api && fb) return fb
    return {
      ...fb!,
      ...api,
      priceCents: fb!.priceCents,
      priceYearCents: fb!.priceYearCents ?? fb!.priceCents * 12,
      name: api?.name || fb!.name,
      description: api?.description || fb!.description,
      features: api?.features?.length ? api.features : fb!.features,
      vcpu: api?.vcpu ?? fb!.vcpu,
      ramMb: api?.ramMb ?? fb!.ramMb,
      diskGb: api?.diskGb ?? fb!.diskGb,
      storageGb: api?.storageGb ?? fb!.storageGb,
      connections: api?.connections ?? fb!.connections,
      highlight: api?.highlight ?? fb!.highlight,
    }
  })
}

export function dbPlanFeatureLines(plan: DbPlan): string[] {
  if (plan.features?.length) return plan.features
  return [
    `${plan.vcpu} vCPU`,
    plan.ramMb >= 1024
      ? `${plan.ramMb / 1024} GB RAM`
      : `${plan.ramMb} MB RAM`,
    `${plan.diskGb} GB disk`,
    `${plan.connections} bağlantı`,
  ]
}

export function dbPlanDisplayAmount(
  plan: DbPlan,
  billingInterval: 'month' | 'year'
): number {
  if (!plan.priceCents) return 0
  if (billingInterval === 'year') {
    return plan.priceYearCents ?? plan.priceCents * 12
  }
  return plan.priceCents
}
