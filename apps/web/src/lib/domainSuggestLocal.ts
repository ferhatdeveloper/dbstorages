/** Offline/mock domain suggest when API is down — keeps cart flow usable. */

const TLD_CATALOG = [
  { tld: 'com', priceUsdCents: 1299, priceTryCents: 44900 },
  { tld: 'net', priceUsdCents: 1499, priceTryCents: 51900 },
  { tld: 'org', priceUsdCents: 1399, priceTryCents: 48900 },
  { tld: 'app', priceUsdCents: 1999, priceTryCents: 69900 },
  { tld: 'com.tr', priceUsdCents: 899, priceTryCents: 29900 },
] as const

export type LocalDomainRow = {
  name: string
  label: string
  tld: string
  available: boolean
  priceUsdCents: number
  priceTryCents: number
  years: number
}

function normalizeLabel(raw: string): { label: string; tld: string | null } {
  let q = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\s+/g, '')
  if (!q) return { label: '', tld: null }
  const known = [...TLD_CATALOG].map((r) => r.tld).sort((a, b) => b.length - a.length)
  for (const tld of known) {
    if (q.endsWith(`.${tld}`) && q.length > tld.length + 1) {
      return { label: q.slice(0, -(tld.length + 1)), tld }
    }
  }
  return { label: q.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, ''), tld: null }
}

function mockTaken(fqdn: string) {
  const reserved = new Set(['google.com', 'facebook.com', 'amazon.com'])
  if (reserved.has(fqdn)) return true
  let h = 0
  for (let i = 0; i < fqdn.length; i++) h = (h * 31 + fqdn.charCodeAt(i)) >>> 0
  return h % 100 < 15
}

export function localDomainSuggest(q: string): LocalDomainRow[] {
  const { label, tld } = normalizeLabel(q)
  if (!label || label.length > 63) return []
  const rows = tld
    ? TLD_CATALOG.filter((r) => r.tld === tld)
    : TLD_CATALOG
  return rows.map((row) => {
    const name = `${label}.${row.tld}`
    return {
      name,
      label,
      tld: row.tld,
      available: !mockTaken(name),
      priceUsdCents: row.priceUsdCents,
      priceTryCents: row.priceTryCents,
      years: 1,
    }
  })
}

export function localDomainCatalog() {
  return TLD_CATALOG.map((r) => ({ ...r }))
}
