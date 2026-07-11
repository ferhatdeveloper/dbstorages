/**
 * Client-side FX helpers — EUR-base rates { EUR, USD, TRY }.
 * Mirrors backend/node/lib/fx conversion math.
 */

export type DisplayCurrency = 'EUR' | 'USD' | 'TRY'

export type FxRates = {
  EUR: number
  USD: number
  TRY: number
}

export type FxPayload = {
  base: 'EUR'
  rates: FxRates
  fetchedAt: string
  source?: string
  stale?: boolean
  date?: string | null
}

/** Documented static fallback — never blank prices if live FX fails. */
export const STATIC_FX_FALLBACK: FxPayload = {
  base: 'EUR',
  rates: {
    EUR: 1,
    USD: 1.08,
    TRY: 47.5,
  },
  fetchedAt: '2026-06-01T00:00:00.000Z',
  source: 'static_fallback',
  stale: true,
}

export const DISPLAY_CURRENCIES: {
  code: DisplayCurrency
  symbol: string
  label: string
}[] = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'US Dollar' },
  { code: 'TRY', symbol: '₺', label: 'Türk Lirası' },
]

export function normalizeCurrency(code?: string | null): DisplayCurrency {
  const c = String(code || 'EUR').trim().toUpperCase()
  if (c === 'USD' || c === 'TRY' || c === 'EUR') return c
  return 'EUR'
}

export function isValidFxRates(rates?: Partial<FxRates> | null): rates is FxRates {
  return Boolean(
    rates &&
      Number.isFinite(rates.EUR) &&
      (rates.EUR as number) > 0 &&
      Number.isFinite(rates.USD) &&
      (rates.USD as number) > 0 &&
      Number.isFinite(rates.TRY) &&
      (rates.TRY as number) > 0
  )
}

/** Convert major units between EUR / USD / TRY. */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: FxRates = STATIC_FX_FALLBACK.rates
): number | null {
  const n = Number(amount)
  if (!Number.isFinite(n)) return null
  const f = normalizeCurrency(from)
  const t = normalizeCurrency(to)
  if (f === t) return n
  const rFrom = rates[f]
  const rTo = rates[t]
  if (!Number.isFinite(rFrom) || rFrom <= 0 || !Number.isFinite(rTo) || rTo <= 0) {
    return null
  }
  return (n / rFrom) * rTo
}

/** Convert integer cents; rounds to nearest cent. */
export function convertCents(
  cents: number,
  from: string,
  to: string,
  rates: FxRates = STATIC_FX_FALLBACK.rates
): number | null {
  if (cents == null || (cents as unknown) === '') return null
  const n = Number(cents)
  if (!Number.isFinite(n)) return null
  const converted = convertAmount(n / 100, from, to, rates)
  if (converted == null) return null
  return Math.round(converted * 100)
}

export function formatMoney(
  amount: number | null | undefined,
  currency: string,
  opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  const cur = normalizeCurrency(currency)
  const max =
    opts?.maximumFractionDigits ??
    (cur === 'TRY' ? 2 : cur === 'USD' && Number.isInteger(Number(amount)) ? 0 : 2)
  const min = opts?.minimumFractionDigits ?? (cur === 'USD' && max === 0 ? 0 : 2)
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: min,
    maximumFractionDigits: max,
  }).format(Number(amount))
}

/** Format cents in source currency, converted to display currency. */
export function formatCentsConverted(
  cents: number | null | undefined,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rates: FxRates = STATIC_FX_FALLBACK.rates,
  opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  if (cents == null || !Number.isFinite(Number(cents))) return '—'
  const converted = convertCents(Number(cents), sourceCurrency, displayCurrency, rates)
  if (converted == null) return '—'
  return formatMoney(converted / 100, displayCurrency, opts)
}

/** Format major-unit amount (e.g. VPS EUR retail) into display currency. */
export function formatAmountConverted(
  amount: number | null | undefined,
  sourceCurrency: string,
  displayCurrency: DisplayCurrency,
  rates: FxRates = STATIC_FX_FALLBACK.rates,
  opts?: { maximumFractionDigits?: number; minimumFractionDigits?: number }
): string {
  if (amount == null || !Number.isFinite(Number(amount))) return '—'
  const converted = convertAmount(Number(amount), sourceCurrency, displayCurrency, rates)
  if (converted == null) return '—'
  return formatMoney(converted, displayCurrency, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  })
}

export function formatFxHint(fx: FxPayload | null | undefined): string {
  if (!fx?.rates) return 'kur: —'
  const usd = fx.rates.USD
  const tryRate = fx.rates.TRY
  const when = fx.fetchedAt
    ? new Date(fx.fetchedAt).toLocaleString('tr-TR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'
  const stale = fx.stale ? ' (önbellek)' : ''
  return `kur: 1 € = ${usd.toFixed(4)} $ · ${tryRate.toFixed(2)} ₺ · güncelleme ${when}${stale}`
}
