/**
 * Cloud module unit tests — mock provider, secrets, queue, service.
 * Run via smoke-mvp.js or: node scripts/test-cloud.js
 */
const path = require('path');
const root = path.join(__dirname, '..');

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

async function main() {
  const { encryptSecret, decryptSecret } = require(path.join(
    root,
    'lib/cloud/secrets'
  ));
  const enc = encryptSecret('tok_secret_123');
  assert(enc && enc.startsWith('v1:'), 'encrypt format');
  assert(decryptSecret(enc) === 'tok_secret_123', 'decrypt roundtrip');
  assert(!String(enc).includes('tok_secret'), 'ciphertext hides plain');

  const { MockCloudProvider } = require(path.join(
    root,
    'lib/cloud/providers/mock'
  ));
  const mock = new MockCloudProvider();
  const created = await mock.createServer({
    name: 'web-1',
    serverType: 'cx22',
    image: 'ubuntu-22.04',
    location: 'nbg1',
  });
  assert(created.server.externalId, 'mock createServer id');
  assert(created.server.ipv4, 'mock ipv4');
  await mock.powerOff(created.server.externalId);
  assert(
    mock.servers.get(created.server.externalId).status === 'off',
    'mock powerOff'
  );
  const images = await mock.listImages();
  assert(images.some((i) => /ubuntu/i.test(i.name)), 'mock ubuntu image');
  assert(images.some((i) => /debian/i.test(i.name)), 'mock debian image');

  const { createProviderFromRow, listSupportedSlugs } = require(path.join(
    root,
    'lib/cloud/factory'
  ));
  assert(listSupportedSlugs().includes('hetzner'), 'slug hetzner registered');
  assert(listSupportedSlugs().includes('mock'), 'slug mock registered');
  const driver = createProviderFromRow({ slug: 'mock' });
  assert(typeof driver.createServer === 'function', 'factory mock driver');

  // Hetzner provider mapping without live API — inject fake client
  const { HetznerProvider } = require(path.join(
    root,
    'lib/cloud/providers/hetzner'
  ));
  const calls = [];
  const fakeClient = {
    request: async ({ method, url, data }) => {
      calls.push({ method, url, data });
      if (url === '/servers' && method === 'POST') {
        return {
          data: {
            server: {
              id: 99,
              name: data.name,
              status: 'initializing',
              server_type: { name: data.server_type },
              image: { name: data.image },
              datacenter: { location: { name: data.location } },
              public_net: {
                ipv4: { ip: '198.51.100.10' },
                ipv6: { ip: '2a01::1' },
              },
              labels: {},
            },
            action: { id: 1, status: 'running' },
            root_password: 'x',
          },
        };
      }
      if (url.startsWith('/images')) {
        return {
          data: {
            images: [
              { id: 1, name: 'ubuntu-22.04', description: 'Ubuntu', os_flavor: 'ubuntu', architecture: 'x86' },
              { id: 2, name: 'debian-12', description: 'Debian', os_flavor: 'debian', architecture: 'x86' },
            ],
          },
        };
      }
      return { data: {} };
    },
  };
  const hz = new HetznerProvider({
    apiToken: 'test-token',
    client: fakeClient,
  });
  const srv = await hz.createServer({
    name: 'api-1',
    serverType: 'cx22',
    image: 'ubuntu-22.04',
    location: 'nbg1',
    enableIpv4: true,
    enableIpv6: true,
  });
  assert(srv.server.externalId === '99', 'hetzner map externalId');
  assert(srv.server.ipv4 === '198.51.100.10', 'hetzner ipv4');
  assert(calls[0].data.public_net.enable_ipv4 === true, 'hetzner ipv4 flag');
  const imgs = await hz.listImages();
  assert(imgs.length >= 2, 'hetzner listImages filtered');

  // Service + queue with mock provider (in-memory store)
  const store = require(path.join(root, 'lib/store'));
  store.cloudProviders = [];
  store.cloudServers = [];
  store.cloudOperations = [];
  store.cloudVolumes = [];
  store.cloudFirewalls = [];
  store.cloudSnapshots = [];
  store.cloudSshKeys = [];
  store.cloudNetworks = [];

  const queue = require(path.join(root, 'lib/cloud/queue'));
  queue.resetForTests();

  const { CloudService } = require(path.join(root, 'lib/cloud/service'));
  const provider = await CloudService.createProvider({
    tenantId: 'ten_demo',
    name: 'Mock Cloud',
    slug: 'mock',
    createdBy: 'usr_demo',
  });
  assert(provider.id, 'createProvider');
  assert(provider.hasApiKey === false, 'no key exposed');

  const { server, operation } = await CloudService.createServer({
    tenantId: 'ten_demo',
    providerId: provider.id,
    name: 'worker-1',
    serverType: 'cx22',
    image: 'ubuntu-22.04',
    location: 'nbg1',
    createdBy: 'usr_demo',
  });
  assert(server.status === 'pending', 'server pending immediately');
  assert(operation.id, 'operation id returned');

  // Wait for in-process queue
  await new Promise((r) => setTimeout(r, 80));
  const op = await CloudService.getOperation(operation.id);
  assert(op.status === 'completed', `operation completed (got ${op?.status})`);
  const updated = await CloudService.getServer('ten_demo', server.id);
  assert(updated.external_id, 'server got external_id');
  assert(updated.status === 'running', 'server running after queue');

  const listed = await CloudService.listServers('ten_demo');
  assert(listed.some((s) => s.id === server.id), 'listServers');

  const catalog = await CloudService.catalog(provider.id, 'images');
  assert(catalog.length >= 4, 'catalog images');

  // withRetry
  const { withRetry, isRetryable } = require(path.join(root, 'lib/cloud/errors'));
  assert(isRetryable({ status: 429 }) === true, 'retryable 429');
  let n = 0;
  const val = await withRetry(
    async () => {
      n += 1;
      if (n < 2) {
        const e = new Error('tmp');
        e.status = 503;
        throw e;
      }
      return 42;
    },
    { retries: 3, baseMs: 1 }
  );
  assert(val === 42 && n === 2, 'withRetry succeeds');

  // Addon vps present, DB plan prices untouched
  const { getAddon, getPackage } = require(path.join(root, 'payments'));
  assert(getAddon('vps')?.contactOnly === true, 'vps addon contactOnly');
  assert(getPackage('pro').priceCents === 3400, 'pro $34 untouched');
  assert(getPackage('scale').priceCents === 5000, 'scale $50 untouched');
  assert(getPackage('max').priceCents === 9900, 'max $99 untouched');
  assert(getAddon('backup').priceCents === 1000, 'backup $10 untouched');

  // Markup helper: retail = provider × 1.20
  const {
    applyRetailMarkup,
    RETAIL_MARKUP,
    CURRENCY,
  } = require(path.join(root, 'lib/cloud/catalog/markup'));
  assert(RETAIL_MARKUP === 1.2, 'markup factor 1.2');
  assert(CURRENCY === 'EUR', 'catalog currency EUR');
  assert(applyRetailMarkup(5.49) === 6.59, '5.49 * 1.2 = 6.59');
  assert(applyRetailMarkup(8.49) === 10.19, '8.49 * 1.2 = 10.19');
  assert(applyRetailMarkup(19.49) === 23.39, '19.49 * 1.2 = 23.39');
  assert(applyRetailMarkup(0) === 0, 'zero markup');
  assert(applyRetailMarkup(null) === null, 'null markup');

  const { getPublicCatalog, findSeedServerType } = require(path.join(
    root,
    'lib/cloud/catalog'
  ));
  const pub = getPublicCatalog();
  assert(pub.markup === 1.2, 'public catalog markup');
  assert(pub.popularPlans.length >= 4, 'popular plans seeded');
  const cx23 = findSeedServerType('cx23');
  assert(cx23.priceProviderMonthly === 5.49, 'cx23 provider price');
  assert(cx23.priceRetailMonthly === 6.59, 'cx23 retail +20%');
  assert(cx23.cores === 2 && cx23.memoryGb === 4, 'cx23 specs');

  const quote = CloudService.quoteServerType('cpx22');
  assert(quote.priceRetailMonthly === 23.39, 'quote cpx22 retail');
  assert(server.cost_provider === 5.49 || server.cost_provider == null || Number(server.cost_provider) >= 0, 'server cost fields optional on mock cx22');

  // Re-create with known seed type to assert cost_provider / price_retail
  const { server: srv2 } = await CloudService.createServer({
    tenantId: 'ten_demo',
    providerId: provider.id,
    name: 'priced-1',
    serverType: 'cx23',
    image: 'ubuntu-22.04',
    location: 'nbg1',
    createdBy: 'usr_demo',
  });
  assert(Number(srv2.cost_provider) === 5.49, 'cx23 cost_provider stored');
  assert(Number(srv2.price_retail) === 6.59, 'cx23 price_retail stored');
  assert(srv2.currency === 'EUR', 'server currency EUR');

  const enriched = await CloudService.catalog(provider.id, 'server-types');
  assert(
    enriched.some((t) => t.name === 'cx23' && t.priceRetailMonthly === 6.59),
    'catalog server-types retail'
  );

  if (failed) {
    console.error(`\ntest-cloud: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\ntest-cloud: OK');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
