/**
 * Resolve CloudProvider implementation from providers.slug.
 * CloudService never imports vendor modules directly.
 */
const { HetznerProvider } = require('./providers/hetzner');
const { MockCloudProvider } = require('./providers/mock');
const { cloudError } = require('./errors');

const DRIVERS = {
  hetzner: HetznerProvider,
  mock: MockCloudProvider,
  // Future: digitalocean, aws_ec2, ...
};

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
  if (slug === 'mock') {
    return new Driver();
  }
  // Per-row encrypted key preferred; env default only for known driver slug.
  let token = decryptedApiKey || '';
  if (!token && slug === 'hetzner') {
    token = process.env.HETZNER_API_TOKEN || '';
  }
  return new Driver({
    apiToken: token,
    baseUrl: row?.config?.baseUrl,
  });
}

function listSupportedSlugs() {
  return Object.keys(DRIVERS);
}

module.exports = {
  createProviderFromRow,
  listSupportedSlugs,
  DRIVERS,
};
