/**
 * Domain catalog + mock availability (registrar keys optional / future).
 */

const dns = require('dns').promises;
const crypto = require('crypto');

const TLD_CATALOG = [
  { tld: 'com', priceUsdCents: 1299, priceTryCents: 44900 },
  { tld: 'net', priceUsdCents: 1499, priceTryCents: 51900 },
  { tld: 'org', priceUsdCents: 1399, priceTryCents: 48900 },
  { tld: 'app', priceUsdCents: 1999, priceTryCents: 69900 },
  { tld: 'com.tr', priceUsdCents: 899, priceTryCents: 29900 },
];

const MARKUP = Math.max(1, Number(process.env.DOMAIN_MARKUP) || 1);

function getCatalog() {
  return TLD_CATALOG.map((row) => ({
    tld: row.tld,
    priceUsdCents: Math.round(row.priceUsdCents * MARKUP),
    priceTryCents: Math.round(row.priceTryCents * MARKUP),
    currencyUsd: 'usd',
    currencyTry: 'try',
    interval: 'year',
    yearsMin: 1,
    yearsMax: 5,
  }));
}

function pricingMap() {
  const map = new Map();
  for (const row of getCatalog()) map.set(row.tld, row);
  return map;
}

/** Strip protocol/path; lowercase; allow unicode → punycode via URL where possible. */
function normalizeQuery(raw) {
  let q = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\s+/g, '');
  if (!q) return { label: '', tld: null, fqdn: '' };
  // If user typed full domain
  const known = [...pricingMap().keys()].sort((a, b) => b.length - a.length);
  for (const tld of known) {
    if (q.endsWith(`.${tld}`) && q.length > tld.length + 1) {
      const label = q.slice(0, -(tld.length + 1));
      if (isValidLabel(label)) {
        return { label, tld, fqdn: `${label}.${tld}` };
      }
    }
  }
  // Label only
  const label = q.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  return { label, tld: null, fqdn: label };
}

function isValidLabel(label) {
  if (!label || label.length > 63) return false;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return false;
  if (label.includes('--')) return false;
  return true;
}

function mockTaken(fqdn) {
  // Stable pseudo-random: ~15% taken; reserved names always taken
  const reserved = new Set([
    'google.com',
    'facebook.com',
    'amazon.com',
    'dbstorages.com',
    'graphcore.com',
    'localhost.com',
  ]);
  if (reserved.has(fqdn)) return true;
  const h = crypto.createHash('sha1').update(fqdn).digest();
  return h[0] < 38; // ~15%
}

async function dnsLooksRegistered(fqdn, timeoutMs = 1200) {
  try {
    const ns = await Promise.race([
      dns.resolveNs(fqdn),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('dns_timeout')), timeoutMs)
      ),
    ]);
    return Array.isArray(ns) && ns.length > 0;
  } catch {
    return false;
  }
}

function dnsCheckEnabled(opts = {}) {
  if (opts.useDns === false) return false;
  if (opts.useDns === true) return true;
  const flag = String(process.env.DOMAIN_DNS_CHECK || '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  if (flag === '1' || flag.toLowerCase() === 'true') return true;
  // Dev/mock: skip live DNS so suggest stays fast and cartable
  return process.env.NODE_ENV === 'production';
}

/**
 * @param {string} q
 * @param {{ useDns?: boolean }} [opts]
 */
async function suggest(q, opts = {}) {
  const useDns = dnsCheckEnabled(opts);
  const { label, tld: typedTld } = normalizeQuery(q);
  if (!isValidLabel(label)) {
    return {
      query: q,
      label: label || null,
      error: 'Geçersiz alan adı etiketi',
      results: [],
    };
  }

  const catalog = getCatalog();
  const tlds = typedTld
    ? catalog.filter((c) => c.tld === typedTld)
    : catalog;

  const results = await Promise.all(
    tlds.map(async (row) => {
      const fqdn = `${label}.${row.tld}`;
      let available = !mockTaken(fqdn);
      let reason = available ? 'available' : 'taken_mock';
      if (available && useDns) {
        const registered = await dnsLooksRegistered(fqdn);
        if (registered) {
          available = false;
          reason = 'taken_dns';
        }
      }
      return {
        name: fqdn,
        label,
        tld: row.tld,
        available,
        reason,
        priceUsdCents: row.priceUsdCents,
        priceTryCents: row.priceTryCents,
        years: 1,
        currency: 'usd',
      };
    })
  );

  return { query: q, label, results };
}

/**
 * Resolve cart domain lines from `{ name, years? }[]`.
 * @returns {{ lines: object[], error?: string }}
 */
function resolveDomainLines(rawList = [], currency = 'usd') {
  const list = Array.isArray(rawList) ? rawList : [];
  const map = pricingMap();
  const lines = [];
  for (const item of list) {
    const name = String(item?.name || item?.fqdn || '')
      .trim()
      .toLowerCase();
    if (!name) continue;
    const parsed = normalizeQuery(name);
    if (!parsed.tld || !parsed.label || !isValidLabel(parsed.label)) {
      return { lines: [], error: `invalid domain: ${name}` };
    }
    const cat = map.get(parsed.tld);
    if (!cat) return { lines: [], error: `unsupported tld: ${parsed.tld}` };
    const years = Math.min(
      5,
      Math.max(1, Math.floor(Number(item.years) || 1))
    );
    const unit =
      String(currency).toLowerCase() === 'try'
        ? cat.priceTryCents
        : cat.priceUsdCents;
    lines.push({
      name: parsed.fqdn,
      label: parsed.label,
      tld: parsed.tld,
      years,
      priceCents: unit * years,
      unitPriceCents: unit,
      currency: String(currency).toLowerCase() === 'try' ? 'try' : 'usd',
      interval: 'year',
    });
  }
  return { lines };
}

function domainsAmountCents(lines = []) {
  return (lines || []).reduce((s, d) => s + (Number(d.priceCents) || 0), 0);
}

module.exports = {
  getCatalog,
  suggest,
  normalizeQuery,
  resolveDomainLines,
  domainsAmountCents,
  TLD_CATALOG,
};
