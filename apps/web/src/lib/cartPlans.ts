/** Shared Database plan catalog for cart hydration across marketing pages. */

export type CartPlanDef = {
  id: string
  name: string
  priceCents: number
  priceYearCents: number
  currency: string
  description?: string
}

/** Yıllık fiyat ana referans; aylık ≈ yıl / 12. */
export const CART_DB_PLANS: CartPlanDef[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceCents: 1250,
    priceYearCents: 15000,
    currency: 'usd',
    description: '1 vCPU · 2 GB · yıllık $150',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3333,
    priceYearCents: 40000,
    currency: 'usd',
  },
  {
    id: 'scale',
    name: 'Scale',
    priceCents: 5000,
    priceYearCents: 60000,
    currency: 'usd',
  },
  {
    id: 'max',
    name: 'Max',
    priceCents: 7500,
    priceYearCents: 90000,
    currency: 'usd',
  },
  {
    id: 'maxplus',
    name: 'Max+',
    priceCents: 10000,
    priceYearCents: 120000,
    currency: 'usd',
  },
]

export const CART_BACKUP_ADDON = {
  id: 'backup',
  name: 'Yedekleme',
  priceCents: 1000,
  priceYearCents: 12000,
  currency: 'usd',
}

export function getCartPlan(id: string): CartPlanDef | null {
  return CART_DB_PLANS.find((p) => p.id === id) || null
}

export function cartPath(opts: {
  plan?: string
  interval?: 'month' | 'year'
  backup?: boolean
}): string {
  const qs = new URLSearchParams()
  if (opts.plan) qs.set('plan', opts.plan)
  if (opts.interval) qs.set('interval', opts.interval)
  if (opts.backup) qs.set('backup', '1')
  const q = qs.toString()
  return q ? `/cart?${q}` : '/cart'
}
