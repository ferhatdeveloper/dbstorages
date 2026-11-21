/** Shared Database plan catalog for cart hydration across marketing pages. */

export type CartPlanDef = {
  id: string
  name: string
  priceCents: number
  priceYearCents: number
  currency: string
  description?: string
}

export const CART_DB_PLANS: CartPlanDef[] = [
  {
    id: 'free',
    name: 'Trial',
    priceCents: 0,
    priceYearCents: 0,
    currency: 'usd',
    description: '15 gün ücretsiz deneme',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceCents: 3400,
    priceYearCents: 40800,
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
    priceCents: 9900,
    priceYearCents: 118800,
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
