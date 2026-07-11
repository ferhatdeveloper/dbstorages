/**
 * Enrich live provider server types with retail markup + seed specs fallback.
 */
const {
  applyRetailMarkup,
  pickProviderMonthly,
  CURRENCY,
  RETAIL_MARKUP,
} = require('./markup');
const { findSeedServerType, getSeedServerTypes, getSeedLocations } = require('./index');
const { attachFamilyFields } = require('./families');

function familyFromName(name) {
  const n = String(name || '').toLowerCase();
  if (n.startsWith('ccx')) return 'ccx';
  if (n.startsWith('cpx')) return 'cpx';
  if (n.startsWith('cax')) return 'cax';
  if (n.startsWith('cx')) return 'cx';
  return 'other';
}

function cpuKindFromFamily(family) {
  return family === 'ccx' ? 'dedicated' : 'shared';
}

/**
 * Map a live listServerTypes() row (or seed-like) to catalog shape with retail.
 * @param {object} t
 * @param {string} [location]
 */
function enrichServerType(t, location) {
  if (!t) return null;
  const name = String(t.name || t.id || '').toLowerCase();
  const seed = findSeedServerType(name);
  const fromPrices = pickProviderMonthly(t.prices, location);
  const providerMonthly =
    fromPrices != null
      ? fromPrices
      : t.priceProviderMonthly != null
        ? Number(t.priceProviderMonthly)
        : seed?.priceProviderMonthly ?? null;

  const family = t.family || seed?.family || familyFromName(name);
  const cores = t.cores ?? seed?.cores ?? null;
  const memoryGb = t.memory ?? t.memoryGb ?? seed?.memoryGb ?? null;
  const diskGb = t.disk ?? t.diskGb ?? seed?.diskGb ?? null;
  const familyFields = attachFamilyFields({
    name,
    family,
    descriptionTr: t.descriptionTr || seed?.descriptionTr,
    useCaseHint: t.useCaseHint || seed?.useCaseHint,
    trafficTb: t.trafficTb ?? seed?.trafficTb,
  });

  return {
    id: String(t.id || name),
    name,
    description: t.description || seed?.description || name.toUpperCase(),
    family,
    familyLabel: familyFields.familyLabel,
    descriptionTr: familyFields.descriptionTr,
    useCaseHint: familyFields.useCaseHint,
    trafficTb: familyFields.trafficTb,
    cpuKind: t.cpuKind || seed?.cpuKind || cpuKindFromFamily(family),
    architecture: t.architecture || seed?.architecture || 'x86',
    cores,
    memory: memoryGb,
    memoryGb,
    disk: diskGb,
    diskGb,
    popular: seed?.popular || false,
    currency: CURRENCY,
    priceProviderMonthly: providerMonthly,
    priceRetailMonthly: applyRetailMarkup(providerMonthly),
    markup: RETAIL_MARKUP,
    prices: t.prices,
  };
}

function enrichServerTypes(list, location) {
  if (!Array.isArray(list) || !list.length) {
    return getSeedServerTypes();
  }
  return list.map((t) => enrichServerType(t, location)).filter(Boolean);
}

function enrichLocations(list) {
  if (!Array.isArray(list) || !list.length) {
    return getSeedLocations();
  }
  return list.map((l) => ({
    id: String(l.id || l.name),
    name: l.name,
    description: l.description,
    country: l.country,
    city: l.city,
    networkZone: l.networkZone,
  }));
}

/**
 * Quote retail monthly for a server type name (seed or enriched).
 */
function quoteServerType(serverTypeName) {
  const enriched = enrichServerType(
    findSeedServerType(serverTypeName) || { name: serverTypeName }
  );
  if (!enriched || enriched.priceProviderMonthly == null) {
    return null;
  }
  return {
    serverType: enriched.name,
    currency: CURRENCY,
    costProviderMonthly: enriched.priceProviderMonthly,
    priceRetailMonthly: enriched.priceRetailMonthly,
    markup: RETAIL_MARKUP,
    cores: enriched.cores,
    memoryGb: enriched.memoryGb,
    diskGb: enriched.diskGb,
  };
}

module.exports = {
  enrichServerType,
  enrichServerTypes,
  enrichLocations,
  quoteServerType,
};
