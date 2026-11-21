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
  trialDays?: number
  features?: string[]
}

export const FALLBACK_DB_PLANS: DbPlan[] = [
  {
    id: 'free',
    name: 'Trial',
    priceCents: 0,
    priceYearCents: 0,
    currency: 'usd',
    interval: 'month',
    trialDays: 15,
    vcpu: 0.5,
    ramMb: 512,
    diskGb: 1,
    storageGb: 0.5,
    connections: 20,
    description: '15 gün ücretsiz deneme — yönetilen Database ile başlayın.',
    features: [
      '15 gün deneme',
      '0.5 vCPU · 512 MB RAM',
      '1 GB veritabanı',
      '20 eşzamanlı bağlantı',
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3400,
    priceYearCents: 40800,
    currency: 'usd',
    interval: 'month',
    vcpu: 2,
    ramMb: 4096,
    diskGb: 25,
    storageGb: 10,
    connections: 100,
    highlight: true,
    description: 'Üretim yükleri için dengeli Database planı.',
    features: [
      '2 vCPU · 4 GB RAM',
      '25 GB veritabanı diski',
      '10 GB object storage',
      '100 eşzamanlı bağlantı',
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
    diskGb: 80,
    storageGb: 50,
    connections: 400,
    description: 'Büyüyen ekipler için daha fazla CPU, disk ve bağlantı.',
    features: [
      '4 vCPU · 8 GB RAM',
      '80 GB veritabanı diski',
      '50 GB object storage',
      '400 eşzamanlı bağlantı',
    ],
  },
  {
    id: 'max',
    name: 'Max',
    priceCents: 9900,
    priceYearCents: 118800,
    currency: 'usd',
    interval: 'month',
    vcpu: 8,
    ramMb: 32768,
    diskGb: 250,
    storageGb: 150,
    connections: 1000,
    description: 'Yüksek kaynak ve bağlantı limiti — büyük üretim iş yükleri.',
    features: [
      '8 vCPU · 32 GB RAM',
      '250 GB veritabanı diski',
      '150 GB object storage',
      '1000 eşzamanlı bağlantı',
    ],
  },
]

export function mergeDbPlansFromApi(apiPlans: DbPlan[]): DbPlan[] {
  if (!apiPlans?.length) return FALLBACK_DB_PLANS
  const byId = new Map(apiPlans.map((p) => [p.id, p]))
  return FALLBACK_DB_PLANS.map((fb) => {
    const api = byId.get(fb.id)
    return {
      ...fb,
      ...api,
      priceCents: fb.priceCents,
      priceYearCents: fb.priceYearCents ?? fb.priceCents * 12,
      name: api?.name || fb.name,
      description: api?.description || fb.description,
      features: api?.features?.length ? api.features : fb.features,
      vcpu: api?.vcpu ?? fb.vcpu,
      ramMb: api?.ramMb ?? fb.ramMb,
      diskGb: api?.diskGb ?? fb.diskGb,
      storageGb: api?.storageGb ?? fb.storageGb,
      connections: api?.connections ?? fb.connections,
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
