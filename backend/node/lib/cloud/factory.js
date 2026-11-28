/**
 * Resolve CloudProvider implementation from providers.slug.
 * CloudService never imports vendor modules directly.
 */
const { HetznerProvider } = require('./providers/hetzner');
const { ManagedCloudProvider } = require('./providers/managed');
const { HostingerProvider } = require('./providers/hostinger');
const { cloudError } = require('./errors');

const DRIVERS = {
  hetzner: HetznerProvider,
  managed: ManagedCloudProvider,
  hostinger: HostingerProvider,
  // Deprecated alias — migrate cloud_providers.slug mock → managed
  mock: ManagedCloudProvider,
};

const PUBLIC_SLUGS = ['hetzner', 'managed', 'hostinger'];

function createProviderFromRow(row, { decryptedApiKey } = {}) {
  const slug = String(row?.slug || '')
    .toLowerCase()
    .trim();
  const Driver = DRIVERS[slug];
  if (!Driver) {
    throw cloudError(
      400,
      `Unknown cloud provider slug: ${slug}`,
      'unknown_provider'
    );
  }
  if (slug === 'managed' || slug === 'mock') {
    return new Driver();
  }
  // Per-row encrypted key preferred; env default only for known driver slug.
  let token = decryptedApiKey || '';
  if (!token && slug === 'hetzner') {
    token = process.env.HETZNER_API_TOKEN || '';
  }
  if (!token && slug === 'hostinger') {
    token = process.env.HOSTINGER_API_TOKEN || '';
  }
  return new Driver({
    apiToken: token,
    baseUrl: row?.config?.baseUrl,
  });
}

function listSupportedSlugs() {
  return [...PUBLIC_SLUGS];
}

module.exports = {
  createProviderFromRow,
  listSupportedSlugs,
  DRIVERS,
};
