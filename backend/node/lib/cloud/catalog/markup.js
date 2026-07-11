/**
 * Retail markup over upstream (Hetzner) list prices.
 * Currency: EUR excl. VAT (same basis as Hetzner Cloud list prices).
 * retailPrice = round(providerPrice * RETAIL_MARKUP, 2)
 */
const RETAIL_MARKUP = 1.2;
const CURRENCY = 'EUR';

/**
 * @param {number|string|null|undefined} providerPrice
 * @returns {number|null}
 */
function applyRetailMarkup(providerPrice) {
  if (providerPrice == null || providerPrice === '') return null;
  const n = Number(providerPrice);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * RETAIL_MARKUP * 100) / 100;
}

/**
 * Parse Hetzner-style monthly price from a server_type.prices entry.
 * Prefers net monthly; falls back to gross.
 * @param {object|null|undefined} priceEntry
 * @returns {number|null}
 */
function extractMonthlyNet(priceEntry) {
  if (!priceEntry) return null;
  const monthly = priceEntry.price_monthly || priceEntry.monthly || {};
  const raw = monthly.net ?? monthly.gross ?? priceEntry.price_monthly_net;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/**
 * Pick a representative monthly provider price from Hetzner prices[] array.
 * Prefers EU location (nbg1/fsn1/hel1), else first entry.
 * @param {Array|null|undefined} prices
 * @param {string} [preferredLocation]
 * @returns {number|null}
 */
function pickProviderMonthly(prices, preferredLocation) {
  if (!Array.isArray(prices) || !prices.length) return null;
  const prefer = preferredLocation || 'nbg1';
  const eu = ['nbg1', 'fsn1', 'hel1'];
  const match =
    prices.find((p) => p.location === prefer) ||
    prices.find((p) => eu.includes(p.location)) ||
    prices[0];
  return extractMonthlyNet(match);
}

module.exports = {
  RETAIL_MARKUP,
  CURRENCY,
  applyRetailMarkup,
  extractMonthlyNet,
  pickProviderMonthly,
};
