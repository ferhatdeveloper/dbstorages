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

  const { ManagedCloudProvider } = require(path.join(
    root,
    'lib/cloud/providers/managed'
  ));
  const managed = new ManagedCloudProvider();
  const created = await managed.createServer({
    name: 'web-1',
    serverType: 'cx22',
    image: 'ubuntu-22.04',
    location: 'nbg1',
  });
  assert(created.server.externalId, 'managed createServer id');
  assert(created.server.ipv4, 'managed ipv4');
  await managed.powerOff(created.server.externalId);
  assert(
    managed.servers.get(created.server.externalId).status === 'off',
    'managed powerOff'
  );
  const images = await managed.listImages();
  assert(images.some((i) => /ubuntu/i.test(i.name)), 'managed ubuntu image');
  assert(images.some((i) => /debian/i.test(i.name)), 'managed debian image');
  assert(images.some((i) => /windows-2022/i.test(i.name)), 'managed windows-2022 image');
  assert(images.some((i) => i.osFamily === 'windows'), 'managed windows osFamily');

  const { createProviderFromRow, listSupportedSlugs } = require(path.join(
    root,
    'lib/cloud/factory'
  ));
  assert(listSupportedSlugs().includes('hetzner'), 'slug hetzner registered');
  assert(listSupportedSlugs().includes('managed'), 'slug managed registered');
  const driver = createProviderFromRow({ slug: 'managed' });
  assert(typeof driver.createServer === 'function', 'factory managed driver');

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
              { id: 3, name: 'windows-2022', description: 'Windows Server 2022', os_flavor: 'windows', architecture: 'x86' },
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
  assert(imgs.some((i) => i.osFamily === 'windows'), 'hetzner windows image filtered');
  assert(imgs.some((i) => /windows/i.test(i.name)), 'hetzner windows-2022 listed');

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
    name: 'Managed Cloud',
    slug: 'managed',
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
  assert(server.cost_provider === 5.49 || server.cost_provider == null || Number(server.cost_provider) >= 0, 'server cost fields optional on managed cx22');

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

  // Parity ops: reset / resize / primary IP / LB / metrics stub
  const resetOp = await CloudService.serverAction({
    tenantId: 'ten_demo',
    serverId: server.id,
    action: 'reset',
    createdBy: 'usr_demo',
  });
  assert(resetOp.id, 'reset operation');
  await new Promise((r) => setTimeout(r, 60));
  assert(
    (await CloudService.getOperation(resetOp.id)).status === 'completed',
    'reset completed'
  );

  const pip = await CloudService.createPrimaryIp({
    tenantId: 'ten_demo',
    providerId: provider.id,
    name: 'pip-1',
    type: 'ipv4',
    createdBy: 'usr_demo',
  });
  assert(pip.primaryIp.id, 'primary ip created');
  await new Promise((r) => setTimeout(r, 60));
  const pipRow = (await CloudService.listPrimaryIps('ten_demo')).find(
    (p) => p.id === pip.primaryIp.id
  );
  assert(pipRow?.external_id || pipRow?.status, 'primary ip provisioned');

  const lb = await CloudService.createLoadBalancer({
    tenantId: 'ten_demo',
    providerId: provider.id,
    name: 'lb-1',
    location: 'nbg1',
    createdBy: 'usr_demo',
  });
  assert(lb.loadBalancer.id, 'load balancer created');

  let metricsStub = false;
  try {
    await CloudService.serverAction({
      tenantId: 'ten_demo',
      serverId: server.id,
      action: 'metrics',
      createdBy: 'usr_demo',
    });
  } catch (e) {
    metricsStub = e.status === 501 || e.code === 'coming_soon';
  }
  assert(metricsStub, 'metrics is honest stub 501');

  const matrix = CloudService.capabilityMatrix();
  assert(Array.isArray(matrix) && matrix.length >= 10, 'parity matrix');
  assert(
    matrix.some((m) => m.status === 'stub' && /metrics/i.test(m.action)),
    'metrics listed as stub'
  );
  assert(getPackage('pro').priceCents === 3400, 'pro still $34 after parity');

  // WireGuard VPN add-on (per-user / peer)
  const VpnService = require(path.join(root, 'lib/cloud/vpn'));
  const { vpnBillingSummary } = require(path.join(root, 'payments'));
  const vpnAddon = getAddon('vpn');
  assert(vpnAddon && vpnAddon.id === 'vpn', 'vpn addon registered');
  assert(vpnAddon.priceCents === 599, 'vpn €5.99/kullanıcı');
  assert(vpnAddon.pricingModel === 'per_user', 'vpn pricingModel per_user');
  assert(vpnAddon.currency === 'eur', 'vpn currency EUR');
  assert(getPackage('pro').priceCents === 3400, 'pro untouched by vpn');
  assert(getPackage('scale').priceCents === 5000, 'scale untouched');
  assert(getPackage('max').priceCents === 9900, 'max untouched');

  const bill0 = vpnBillingSummary(0);
  assert(bill0.totalCents === 0, '0 seats = €0');
  assert(bill0.label.includes('0 kullanıcı'), '0 kullanıcı label');
  const bill3 = vpnBillingSummary(3);
  assert(bill3.totalCents === 599 * 3, '3 × €5.99');
  assert(bill3.label === '3 kullanıcı × €5.99 = €17.97/ay', 'per-user math label');
  assert(bill3.quantity === 3, 'quantity = peer count');

  const kp = VpnService.generateKeyPair();
  assert(kp.privateKey && kp.publicKey, 'wg keypair');
  assert(kp.privateKey !== kp.publicKey, 'wg keys distinct');
  const addr = VpnService.nextClientAddress('10.66.0.0/24', ['10.66.0.2/32']);
  assert(addr === '10.66.0.3/32', 'next address skips used');

  const enabled = await VpnService.enable({
    tenantId: 'ten_demo',
    createdBy: 'usr_demo',
  });
  assert(enabled && enabled.id, 'vpn enable network');
  assert(enabled.subnetCidr === '10.66.0.0/24' || enabled.subnetCidr, 'vpn subnet');

  const createdPeer = await VpnService.createPeer({
    tenantId: 'ten_demo',
    userId: 'usr_demo',
    createdBy: 'usr_demo',
    name: 'test-laptop',
    serverId: server.id,
  });
  assert(createdPeer.peer?.id, 'vpn peer created');
  assert(createdPeer.config?.config?.includes('[Interface]'), 'wg config text');
  assert(createdPeer.config?.config?.includes('PrivateKey'), 'wg private key in conf');
  assert(
    createdPeer.config?.config?.includes('10.66.0.'),
    'wg address in subnet'
  );
  assert(createdPeer.billing?.seats === 1, '1 billable seat after create');
  assert(createdPeer.billing?.totalCents === 599, '€5.99 for 1 seat');
  assert(createdPeer.billingDelta?.addedUnitCents === 599, 'delta +€5.99');
  assert(
    String(createdPeer.billingDelta?.warning || '').includes('+€5.99'),
    'create warns additional monthly cost'
  );

  const st = await VpnService.status('ten_demo');
  assert(st.enabled === true, 'vpn status enabled');
  assert(st.addon.priceCents === 599, 'status exposes unit price');
  assert(st.addon.pricingModel === 'per_user', 'status pricingModel');
  assert(st.billing?.seats === 1, 'status seats');
  assert(st.billing?.label === '1 kullanıcı × €5.99 = €5.99/ay', 'status billing label');
  assert(st.quantity === 1, 'status quantity');
  assert(st.peers.length >= 1, 'status lists peers');
  assert(st.peers[0].billable === true, 'peer marked billable');

  const cfg = await VpnService.peerConfig('ten_demo', createdPeer.peer.id);
  assert(cfg.filename?.endsWith('.conf'), 'config filename');
  assert(cfg.qrDataUrl == null || String(cfg.qrDataUrl).startsWith('data:image'), 'qr optional data url');

  const revoked = await VpnService.revokePeer('ten_demo', createdPeer.peer.id);
  assert(revoked.status === 'revoked', 'peer revoked');
  assert(revoked.billing?.seats === 0, 'seats drop after revoke');
  assert(revoked.billing?.totalCents === 0, '€0 after revoke');

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
