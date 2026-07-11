/**
 * Live FX rates (EUR base) for display conversion.
 * Primary: Frankfurter (free, no API key). Fallback: static documented rates.
 * Cache TTL: 10 minutes. Never returns blank — always has rates.
 */

const axios = require('axios');

const CACHE_TTL_MS = Number(process.env.FX_CACHE_TTL_MS || 10 * 60 * 1000);
const FETCH_TIMEOUT_MS = 8000;

/** Documented static fallback (approx mid-2026) — used when live APIs fail. */
const STATIC_FALLBACK = {
  base: 'EUR',
  rates: {
    EUR: 1,
    USD: 1.08,
    TRY: 47.5,
  },
  fetchedAt: '2026-06-01T00:00:00.000Z',
  source: 'static_fallback',
  stale: true,
};

const SOURCES = [
  {
    id: 'frankfurter.dev',
    url: 'https://api.frankfurter.dev/v1/latest?base=EUR&symbols=USD,TRY',
    parse: (data) => ({
      rates: { EUR: 1, USD: Number(data.rates?.USD), TRY: Number(data.rates?.TRY) },
      date: data.date,
    }),
  },
  {
    id: 'frankfurter.app',
    url: 'https://api.frankfurter.app/latest?from=EUR&to=USD,TRY',
    parse: (data) => ({
      rates: { EUR: 1, USD: Number(data.rates?.USD), TRY: Number(data.rates?.TRY) },
      date: data.date,
    }),
  },
  {
    id: 'open.er-api',
    url: 'https://open.er-api.com/v6/latest/EUR',
    parse: (data) => ({
      rates: {
        EUR: 1,
        USD: Number(data.rates?.USD),
        TRY: Number(data.rates?.TRY),
      },
      date: data.time_last_update_utc || null,
    }),
  },
];

let cache = null;
let inflight = null;

function normalizeCurrency(code) {
  return String(code || 'EUR').trim().toUpperCase();
}

function isValidRates(rates) {
  return (
    rates &&
    Number.isFinite(rates.EUR) &&
    rates.EUR > 0 &&
    Number.isFinite(rates.USD) &&
    rates.USD > 0 &&
    Number.isFinite(rates.TRY) &&
    rates.TRY > 0
  );
}

function buildPayload({ rates, source, fetchedAt, stale = false, date = null }) {
  return {
    base: 'EUR',
    rates: {
      EUR: 1,
      USD: Number(rates.USD),
      TRY: Number(rates.TRY),
    },
    fetchedAt: fetchedAt || new Date().toISOString(),
    source,
    stale: Boolean(stale),
    date: date || null,
  };
}

/**
 * Convert amount between EUR / USD / TRY using EUR-base rates.
 * amount is in major units (not cents).
 */
function convert(amount, from, to, rates = STATIC_FALLBACK.rates) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return null;
  const f = normalizeCurrency(from);
  const t = normalizeCurrency(to);
  if (f === t) return n;
  const rFrom = rates[f];
  const rTo = rates[t];
  if (!Number.isFinite(rFrom) || rFrom <= 0 || !Number.isFinite(rTo) || rTo <= 0) {
    return null;
  }
  // amount_from / rate_from * rate_to  (rates are "1 EUR = rate units")
  return (n / rFrom) * rTo;
}

/** Convert integer cents between currencies; rounds to nearest cent. */
function convertCents(cents, from, to, rates = STATIC_FALLBACK.rates) {
  if (cents == null || cents === '') return null;
  const n = Number(cents);
  if (!Number.isFinite(n)) return null;
  const converted = convert(n / 100, from, to, rates);
  if (converted == null) return null;
  return Math.round(converted * 100);
}

async function fetchFromSource(source) {
  const res = await axios.get(source.url, {
    timeout: FETCH_TIMEOUT_MS,
    headers: { Accept: 'application/json' },
    validateStatus: (s) => s >= 200 && s < 300,
  });
  const parsed = source.parse(res.data);
  if (!isValidRates(parsed.rates)) {
    throw new Error(`${source.id}: invalid rates`);
  }
  return buildPayload({
    rates: parsed.rates,
    source: source.id,
    fetchedAt: new Date().toISOString(),
    stale: false,
    date: parsed.date,
  });
}

async function fetchLiveRates() {
  const errors = [];
  for (const source of SOURCES) {
    try {
      return await fetchFromSource(source);
    } catch (err) {
      errors.push(`${source.id}: ${err.message}`);
    }
  }
  const last = cache && isValidRates(cache.rates) ? cache : null;
  if (last) {
    return {
      ...last,
      stale: true,
      source: `${last.source}_cached`,
      fetchErrors: errors,
    };
  }
  return {
    ...STATIC_FALLBACK,
    fetchErrors: errors,
  };
}

/**
 * Get rates with short in-memory cache.
 * Always resolves to a usable payload (live | last cache | static).
 */
async function getRates({ force = false } = {}) {
  const now = Date.now();
  if (
    !force &&
    cache &&
    isValidRates(cache.rates) &&
    cache._cachedAt &&
    now - cache._cachedAt < CACHE_TTL_MS
  ) {
    const { _cachedAt, ...publicPayload } = cache;
    return publicPayload;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const payload = await fetchLiveRates();
      cache = { ...payload, _cachedAt: Date.now() };
      const { _cachedAt, ...publicPayload } = cache;
      return publicPayload;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** Sync snapshot for enrichment when await isn't convenient — may be stale/static. */
function getRatesSync() {
  if (cache && isValidRates(cache.rates)) {
    const { _cachedAt, ...publicPayload } = cache;
    return publicPayload;
  }
  return { ...STATIC_FALLBACK };
}

/** Warm cache on startup (non-blocking). */
function warmCache() {
  getRates().catch((err) => {
    console.warn('[fx] warm failed:', err.message);
  });
}

module.exports = {
  CACHE_TTL_MS,
  STATIC_FALLBACK,
  normalizeCurrency,
  convert,
  convertCents,
  getRates,
  getRatesSync,
  warmCache,
  isValidRates,
};
