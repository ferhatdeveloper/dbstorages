import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  CART_BACKUP_ADDON,
  getCartPlan,
} from '../lib/cartPlans'

export type CartItemType = 'plan' | 'addon' | 'domain' | 'vps'

export type CartItem = {
  type: CartItemType
  id: string
  name: string
  priceCents: number
  currency: string
  interval?: 'month' | 'year'
  years?: number
  meta?: Record<string, unknown>
}

type AddDatabasePlanOpts = {
  planId: string
  interval?: 'month' | 'year'
  backup?: boolean
  /** Override catalog (e.g. from DatabasePage live plan) */
  plan?: {
    id: string
    name: string
    priceCents: number
    priceYearCents?: number
    currency?: string
    description?: string
  }
}

type AddVpsOpts = {
  id: string
  name: string
  priceCents: number
  currency?: string
  meta?: Record<string, unknown>
}

type CartContextValue = {
  items: CartItem[]
  count: number
  addItem: (item: CartItem) => void
  addDatabasePlan: (opts: AddDatabasePlanOpts) => boolean
  addVps: (opts: AddVpsOpts) => void
  removeItem: (type: CartItemType, id: string) => void
  clear: () => void
  setInterval: (interval: 'month' | 'year') => void
  billingInterval: 'month' | 'year'
  planItem: CartItem | null
  addonIds: string[]
  domains: { name: string; years: number }[]
  vpsItems: { id: string; name: string; priceCents: number; currency: string }[]
  totalCents: number
}

const STORAGE_KEY = 'dbstorages_cart_v1'

const CartContext = createContext<CartContextValue | undefined>(undefined)

function load(): { items: CartItem[]; billingInterval: 'month' | 'year' } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { items: [], billingInterval: 'month' }
    const parsed = JSON.parse(raw)
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      billingInterval: parsed.billingInterval === 'year' ? 'year' : 'month',
    }
  } catch {
    return { items: [], billingInterval: 'month' }
  }
}

export const CartProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const initial = load()
  const [items, setItems] = useState<CartItem[]>(initial.items)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    initial.billingInterval
  )

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ items, billingInterval })
    )
  }, [items, billingInterval])

  const addItem = useCallback((item: CartItem) => {
    setItems((prev) => {
      if (item.type === 'plan') {
        const withoutPlans = prev.filter((i) => i.type !== 'plan')
        return [...withoutPlans, item]
      }
      if (item.type === 'addon') {
        if (prev.some((i) => i.type === 'addon' && i.id === item.id)) return prev
        return [...prev, item]
      }
      // domain / vps: unique by id
      if (
        (item.type === 'domain' || item.type === 'vps') &&
        prev.some((i) => i.type === item.type && i.id === item.id)
      ) {
        return prev
      }
      return [...prev, item]
    })
  }, [])

  const addDatabasePlan = useCallback(
    (opts: AddDatabasePlanOpts) => {
      const catalog = opts.plan || getCartPlan(opts.planId)
      if (!catalog) return false
      const interval =
        catalog.priceCents === 0 ? 'month' : opts.interval || 'month'
      setBillingInterval(interval)
      setItems((prev) => {
        let next = prev.filter((i) => i.type !== 'plan')
        next = [
          ...next,
          {
            type: 'plan',
            id: catalog.id,
            name: catalog.name,
            priceCents: catalog.priceCents,
            currency: catalog.currency || 'usd',
            interval,
            meta: {
              priceYearCents:
                'priceYearCents' in catalog
                  ? catalog.priceYearCents
                  : catalog.priceCents * 12,
              description: catalog.description,
            },
          },
        ]
        if (opts.backup && catalog.priceCents > 0) {
          next = next.filter((i) => !(i.type === 'addon' && i.id === 'backup'))
          next.push({
            type: 'addon',
            id: CART_BACKUP_ADDON.id,
            name: CART_BACKUP_ADDON.name,
            priceCents: CART_BACKUP_ADDON.priceCents,
            currency: CART_BACKUP_ADDON.currency,
            interval,
            meta: { priceYearCents: CART_BACKUP_ADDON.priceYearCents },
          })
        }
        return next
      })
      return true
    },
    []
  )

  const addVps = useCallback((opts: AddVpsOpts) => {
    addItem({
      type: 'vps',
      id: opts.id,
      name: opts.name,
      priceCents: Math.max(0, Math.round(Number(opts.priceCents) || 0)),
      currency: (opts.currency || 'eur').toLowerCase(),
      interval: 'month',
      meta: opts.meta,
    })
  }, [addItem])

  const removeItem = useCallback((type: CartItemType, id: string) => {
    setItems((prev) => prev.filter((i) => !(i.type === type && i.id === id)))
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const setInterval = useCallback((interval: 'month' | 'year') => {
    setBillingInterval(interval)
  }, [])

  const planItem = useMemo(
    () => items.find((i) => i.type === 'plan') || null,
    [items]
  )
  const addonIds = useMemo(
    () => items.filter((i) => i.type === 'addon').map((i) => i.id),
    [items]
  )
  const domains = useMemo(
    () =>
      items
        .filter((i) => i.type === 'domain')
        .map((i) => ({ name: i.id, years: i.years || 1 })),
    [items]
  )
  const vpsItems = useMemo(
    () =>
      items
        .filter((i) => i.type === 'vps')
        .map((i) => ({
          id: i.id,
          name: i.name,
          priceCents: i.priceCents,
          currency: i.currency || 'eur',
        })),
    [items]
  )

  const totalCents = useMemo(() => {
    return items.reduce((sum, i) => {
      if (i.type === 'plan' || i.type === 'addon') {
        if (billingInterval === 'year' && i.meta?.priceYearCents != null) {
          return sum + Number(i.meta.priceYearCents)
        }
        return sum + (Number(i.priceCents) || 0)
      }
      return sum + (Number(i.priceCents) || 0)
    }, 0)
  }, [items, billingInterval])

  const value: CartContextValue = {
    items,
    count: items.length,
    addItem,
    addDatabasePlan,
    addVps,
    removeItem,
    clear,
    setInterval,
    billingInterval,
    planItem,
    addonIds,
    domains,
    vpsItems,
    totalCents,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used within CartProvider')
  return ctx
}
