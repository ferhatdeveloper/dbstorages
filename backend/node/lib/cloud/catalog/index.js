/**
 * Static Hetzner-like catalog (EU FSN/NBG/HEL list prices, Jun 2026).
 * Source: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
 * and https://www.hetzner.com/cloud — prices excl. VAT, excl. Primary IPv4.
 *
 * Live API (listServerTypes / listLocations) overrides when a token is present;
 * this seed is always the offline / marketing fallback.
 */
const { applyRetailMarkup, CURRENCY, RETAIL_MARKUP } = require('./markup');

/** @typedef {{ name: string, description: string, family: string, cpuKind: 'shared'|'dedicated', architecture: string, cores: number, memoryGb: number, diskGb: number, priceProviderMonthly: number, popular?: boolean }} SeedServerType */

/** @type {SeedServerType[]} */
const SERVER_TYPES = [
  // CX — shared, cost-optimized (Intel/AMD)
  {
    name: 'cx23',
    description: 'CX23',
    family: 'cx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 2,
    memoryGb: 4,
    diskGb: 40,
    priceProviderMonthly: 5.49,
    popular: true,
  },
  {
    name: 'cx33',
    description: 'CX33',
    family: 'cx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 4,
    memoryGb: 8,
    diskGb: 80,
    priceProviderMonthly: 8.49,
    popular: true,
  },
  {
    name: 'cx43',
    description: 'CX43',
    family: 'cx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 8,
    memoryGb: 16,
    diskGb: 160,
    priceProviderMonthly: 15.99,
  },
  {
    name: 'cx53',
    description: 'CX53',
    family: 'cx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 16,
    memoryGb: 32,
    diskGb: 320,
    priceProviderMonthly: 29.49,
  },
  // CAX — shared Ampere ARM
  {
    name: 'cax11',
    description: 'CAX11',
    family: 'cax',
    cpuKind: 'shared',
    architecture: 'arm',
    cores: 2,
    memoryGb: 4,
    diskGb: 40,
    priceProviderMonthly: 5.99,
    popular: true,
  },
  {
    name: 'cax21',
    description: 'CAX21',
    family: 'cax',
    cpuKind: 'shared',
    architecture: 'arm',
    cores: 4,
    memoryGb: 8,
    diskGb: 80,
    priceProviderMonthly: 10.49,
  },
  {
    name: 'cax31',
    description: 'CAX31',
    family: 'cax',
    cpuKind: 'shared',
    architecture: 'arm',
    cores: 8,
    memoryGb: 16,
    diskGb: 160,
    priceProviderMonthly: 20.99,
  },
  {
    name: 'cax41',
    description: 'CAX41',
    family: 'cax',
    cpuKind: 'shared',
    architecture: 'arm',
    cores: 16,
    memoryGb: 32,
    diskGb: 320,
    priceProviderMonthly: 40.99,
  },
  // CPX — shared AMD regular performance (EU Gen2)
  {
    name: 'cpx22',
    description: 'CPX22',
    family: 'cpx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 2,
    memoryGb: 4,
    diskGb: 80,
    priceProviderMonthly: 19.49,
    popular: true,
  },
  {
    name: 'cpx32',
    description: 'CPX32',
    family: 'cpx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 4,
    memoryGb: 8,
    diskGb: 160,
    priceProviderMonthly: 35.49,
  },
  {
    name: 'cpx42',
    description: 'CPX42',
    family: 'cpx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 8,
    memoryGb: 16,
    diskGb: 320,
    priceProviderMonthly: 69.49,
  },
  {
    name: 'cpx52',
    description: 'CPX52',
    family: 'cpx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 12,
    memoryGb: 24,
    diskGb: 480,
    priceProviderMonthly: 100.49,
  },
  {
    name: 'cpx62',
    description: 'CPX62',
    family: 'cpx',
    cpuKind: 'shared',
    architecture: 'x86',
    cores: 16,
    memoryGb: 32,
    diskGb: 640,
    priceProviderMonthly: 129.99,
  },
  // CCX — dedicated vCPU
  {
    name: 'ccx13',
    description: 'CCX13',
    family: 'ccx',
    cpuKind: 'dedicated',
    architecture: 'x86',
    cores: 2,
    memoryGb: 8,
    diskGb: 80,
    priceProviderMonthly: 42.99,
    popular: true,
  },
  {
    name: 'ccx23',
    description: 'CCX23',
    family: 'ccx',
    cpuKind: 'dedicated',
    architecture: 'x86',
    cores: 4,
    memoryGb: 16,
    diskGb: 160,
    priceProviderMonthly: 85.99,
  },
  {
    name: 'ccx33',
    description: 'CCX33',
    family: 'ccx',
    cpuKind: 'dedicated',
    architecture: 'x86',
    cores: 8,
    memoryGb: 32,
    diskGb: 240,
    priceProviderMonthly: 138.49,
  },
  {
    name: 'ccx43',
    description: 'CCX43',
    family: 'ccx',
    cpuKind: 'dedicated',
    architecture: 'x86',
    cores: 16,
    memoryGb: 64,
    diskGb: 360,
    priceProviderMonthly: 275.99,
  },
  {
    name: 'ccx53',
    description: 'CCX53',
    family: 'ccx',
    cpuKind: 'dedicated',
    architecture: 'x86',
    cores: 32,
    memoryGb: 128,
    diskGb: 600,
    priceProviderMonthly: 533.49,
  },
  {
    name: 'ccx63',
    description: 'CCX63',
    family: 'ccx',
    cpuKind: 'dedicated',
    architecture: 'x86',
    cores: 48,
    memoryGb: 192,
    diskGb: 960,
    priceProviderMonthly: 853.49,
  },
];

const LOCATIONS = [
  { id: 'nbg1', name: 'nbg1', description: 'Nuremberg', country: 'DE', city: 'Nuremberg', networkZone: 'eu-central' },
  { id: 'fsn1', name: 'fsn1', description: 'Falkenstein', country: 'DE', city: 'Falkenstein', networkZone: 'eu-central' },
  { id: 'hel1', name: 'hel1', description: 'Helsinki', country: 'FI', city: 'Helsinki', networkZone: 'eu-central' },
  { id: 'ash', name: 'ash', description: 'Ashburn, VA', country: 'US', city: 'Ashburn', networkZone: 'us-east' },
  { id: 'hil', name: 'hil', description: 'Hillsboro, OR', country: 'US', city: 'Hillsboro', networkZone: 'us-west' },
  { id: 'sin', name: 'sin', description: 'Singapore', country: 'SG', city: 'Singapore', networkZone: 'ap-southeast' },
];

/** Volume / snapshot / IP add-ons (provider unit prices → retail via markup) */
const STORAGE = {
  volumePerGbMonthly: 0.0572,
  snapshotPerGbMonthly: 0.0143,
  primaryIpv4Monthly: 0.5,
  primaryIpv6Monthly: 0,
  /** Hetzner automatic backups = 20% of instance list price */
  backupFractionOfInstance: 0.2,
  firewallMonthly: 0,
  networkMonthly: 0,
};

const VOLUME_PRESETS = [
  { sizeGb: 10 },
  { sizeGb: 20 },
  { sizeGb: 50 },
  { sizeGb: 100 },
  { sizeGb: 200 },
  { sizeGb: 500 },
];

function withRetail(server) {
  const cost = server.priceProviderMonthly;
  return {
    id: server.name,
    name: server.name,
    description: server.description,
    family: server.family,
    cpuKind: server.cpuKind,
    architecture: server.architecture,
    cores: server.cores,
    memory: server.memoryGb,
    memoryGb: server.memoryGb,
    disk: server.diskGb,
    diskGb: server.diskGb,
    popular: !!server.popular,
    currency: CURRENCY,
    priceProviderMonthly: cost,
    priceRetailMonthly: applyRetailMarkup(cost),
    markup: RETAIL_MARKUP,
  };
}

function getSeedServerTypes({ popularOnly = false } = {}) {
  const list = SERVER_TYPES.map(withRetail);
  return popularOnly ? list.filter((s) => s.popular) : list;
}

function getSeedLocations() {
  return LOCATIONS.map((l) => ({ ...l }));
}

function getSeedStorage() {
  return {
    currency: CURRENCY,
    markup: RETAIL_MARKUP,
    volumePerGb: {
      provider: STORAGE.volumePerGbMonthly,
      retail: applyRetailMarkup(STORAGE.volumePerGbMonthly),
    },
    snapshotPerGb: {
      provider: STORAGE.snapshotPerGbMonthly,
      retail: applyRetailMarkup(STORAGE.snapshotPerGbMonthly),
    },
    primaryIpv4: {
      provider: STORAGE.primaryIpv4Monthly,
      retail: applyRetailMarkup(STORAGE.primaryIpv4Monthly),
    },
    primaryIpv6: {
      provider: STORAGE.primaryIpv6Monthly,
      retail: applyRetailMarkup(STORAGE.primaryIpv6Monthly) ?? 0,
    },
    backupFractionOfInstance: STORAGE.backupFractionOfInstance,
    firewallMonthly: { provider: 0, retail: 0 },
    networkMonthly: { provider: 0, retail: 0 },
    volumePresets: VOLUME_PRESETS.map((v) => {
      const provider = Math.round(v.sizeGb * STORAGE.volumePerGbMonthly * 100) / 100;
      return {
        sizeGb: v.sizeGb,
        priceProviderMonthly: provider,
        priceRetailMonthly: applyRetailMarkup(provider),
        currency: CURRENCY,
      };
    }),
  };
}

function findSeedServerType(name) {
  if (!name) return null;
  const key = String(name).toLowerCase();
  const raw = SERVER_TYPES.find((s) => s.name === key);
  return raw ? withRetail(raw) : null;
}

function getPublicCatalog() {
  return {
    currency: CURRENCY,
    markup: RETAIL_MARKUP,
    markupNote:
      'Retail display/billing = upstream (Hetzner) list price × 1.20. Amounts in EUR excl. VAT; Primary IPv4 billed separately.',
    source: 'seed',
    serverTypes: getSeedServerTypes(),
    popularPlans: getSeedServerTypes({ popularOnly: true }),
    locations: getSeedLocations(),
    storage: getSeedStorage(),
    structures: {
      servers: ['name', 'serverType', 'image', 'location', 'sshKeys', 'userData', 'enableIpv4', 'enableIpv6'],
      volumes: ['name', 'sizeGb', 'location', 'attach'],
      snapshots: ['serverId', 'name', 'restore'],
      firewalls: ['name', 'rules'],
      networks: ['name', 'ipRange', 'subnets'],
      primaryIps: ['ipv4', 'ipv6', 'reverseDns'],
    },
  };
}

module.exports = {
  SERVER_TYPES,
  LOCATIONS,
  STORAGE,
  VOLUME_PRESETS,
  getSeedServerTypes,
  getSeedLocations,
  getSeedStorage,
  findSeedServerType,
  getPublicCatalog,
};
