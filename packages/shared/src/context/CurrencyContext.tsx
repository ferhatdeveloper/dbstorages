import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  STATIC_FX_FALLBACK,
  convertAmount,
  convertCents,
  formatAmountConverted,
  formatCentsConverted,
  formatFxHint,
  formatMoney,
  isValidFxRates,
  normalizeCurrency,
  type DisplayCurrency,
  type FxPayload,
  type FxRates,
} from '../lib/fx'

const STORAGE_KEY = 'graphcore-currency'
const NODE_API_BASE = import.meta.env.VITE_NODE_API_BASE || '/api'

type CurrencyContextValue = {
  currency: DisplayCurrency
  setCurrency: (c: DisplayCurrency) => void
  rates: FxRates
  fx: FxPayload
  loading: boolean
  refresh: () => Promise<void>
  convert: (amount: number, from: string, to?: DisplayCurrency) => number | null
  convertCents: (cents: number, from: string, to?: DisplayCurrency) => number | null
  formatCents: (
    cents: number | null | undefined,
    sourceCurrency?: string,
    opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
  ) => string
  formatAmount: (
    amount: number | null | undefined,
    sourceCurrency?: string,
    opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
  ) => string
  format: (amount: number | null | undefined, currency?: string) => string
  fxHint: string
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

function readStoredCurrency(): DisplayCurrency {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'EUR' || raw === 'USD' || raw === 'TRY') return raw
  } catch {
    /* ignore */
  }
  return 'EUR'
}

function mergeFx(payload: any): FxPayload {
  const rates = payload?.rates || payload?.data?.rates
  if (isValidFxRates(rates)) {
    return {
      base: 'EUR',
      rates: {
        EUR: 1,
        USD: Number(rates.USD),
        TRY: Number(rates.TRY),
      },
      fetchedAt: payload.fetchedAt || payload.data?.fetchedAt || new Date().toISOString(),
      source: payload.source || payload.data?.source,
      stale: Boolean(payload.stale ?? payload.data?.stale),
      date: payload.date ?? payload.data?.date ?? null,
    }
  }
  return { ...STATIC_FX_FALLBACK }
}

export const CurrencyProvider: React.FC<{
  children: React.ReactNode
  /** Optional preloaded FX from /api/packages */
  initialFx?: FxPayload | null
}> = ({ children, initialFx }) => {
  const [currency, setCurrencyState] = useState<DisplayCurrency>(() =>
    readStoredCurrency()
  )
  const [fx, setFx] = useState<FxPayload>(() =>
    initialFx && isValidFxRates(initialFx.rates)
      ? mergeFx(initialFx)
      : { ...STATIC_FX_FALLBACK }
  )
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`${NODE_API_BASE}/fx`)
      const json = await res.json()
      const payload = json?.data || json
      setFx(mergeFx(payload))
    } catch {
      setFx((prev) =>
        isValidFxRates(prev.rates) ? { ...prev, stale: true } : { ...STATIC_FX_FALLBACK }
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (initialFx && isValidFxRates(initialFx.rates)) {
      setFx(mergeFx(initialFx))
      return
    }
    refresh()
  }, [initialFx, refresh])

  // Refresh every 10 minutes while tab is open
  useEffect(() => {
    const id = window.setInterval(() => {
      refresh()
    }, 10 * 60 * 1000)
    return () => window.clearInterval(id)
  }, [refresh])

  const setCurrency = useCallback((next: DisplayCurrency) => {
    const c = normalizeCurrency(next)
    setCurrencyState(c)
    try {
      localStorage.setItem(STORAGE_KEY, c)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo<CurrencyContextValue>(() => {
    const rates = fx.rates
    return {
      currency,
      setCurrency,
      rates,
      fx,
      loading,
      refresh,
      convert: (amount, from, to = currency) => convertAmount(amount, from, to, rates),
      convertCents: (cents, from, to = currency) => convertCents(cents, from, to, rates),
      formatCents: (cents, sourceCurrency = 'USD', opts) =>
        formatCentsConverted(cents, sourceCurrency, currency, rates, opts),
      formatAmount: (amount, sourceCurrency = 'EUR', opts) =>
        formatAmountConverted(amount, sourceCurrency, currency, rates, opts),
      format: (amount, cur = currency) => formatMoney(amount, cur),
      fxHint: formatFxHint(fx),
    }
  }, [currency, fx, loading, refresh, setCurrency])

  return (
    <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>
  )
}

export function useCurrency() {
  const ctx = useContext(CurrencyContext)
  if (!ctx) {
    throw new Error('useCurrency must be used within CurrencyProvider')
  }
  return ctx
}

/** Safe hook — returns null outside provider (optional UI). */
export function useCurrencyOptional() {
  return useContext(CurrencyContext)
}
