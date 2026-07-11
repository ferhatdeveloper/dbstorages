/**
 * WireGuard VPN add-on service (provider-agnostic).
 * Priced per user (active peer = 1 seat). Mock mode works without a real WG endpoint.
 */
const store = require('../../store');
const {
  getAddon,
  vpnBillingSummary,
  unitAmountCents,
} = require('../../../payments');
const cloudRepo = require('../repository');
const { generateKeyPair } = require('./keys');
const {
  buildClientConfig,
  configToQrDataUrl,
  vpnEnvDefaults,
} = require('./config');
const repo = require('./repository');

function fail(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function parseSubnet(cidr) {
  const [base, bits] = String(cidr || '10.66.0.0/24').split('/');
  const parts = base.split('.').map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) {
    throw fail(400, 'invalid_subnet', 'Invalid VPN subnet');
  }
  const prefix = Number(bits || 24);
  return { parts, prefix };
}

function nextClientAddress(subnetCidr, usedCidrs) {
  const { parts } = parseSubnet(subnetCidr);
  const used = new Set(
    (usedCidrs || []).map((c) => String(c).split('/')[0])
  );
  // .1 reserved for WG server; assign .2 .. .254
  for (let host = 2; host <= 254; host += 1) {
    const ip = `${parts[0]}.${parts[1]}.${parts[2]}.${host}`;
    if (!used.has(ip)) return `${ip}/32`;
  }
  throw fail(409, 'subnet_full', 'VPN subnet has no free addresses');
}

function addonCatalog() {
  const addon = getAddon('vpn') || {
    id: 'vpn',
    name: 'WireGuard VPN',
    priceCents: 599,
    priceYearCents: 7188,
    currency: 'eur',
    pricingModel: 'per_user',
    unitLabel: 'kullanıcı',
  };
  return {
    id: addon.id,
    name: addon.name,
    priceCents: addon.priceCents,
    priceYearCents: addon.priceYearCents ?? addon.priceCents * 12,
    currency: addon.currency || 'eur',
    pricingModel: addon.pricingModel || 'per_user',
    unitLabel: addon.unitLabel || 'kullanıcı',
    billingNote: addon.billingNote,
    description: addon.description,
    studioPath: addon.studioPath || '/cloud/vpn',
    contactOnly: Boolean(addon.contactOnly),
    messaging: addon.messaging || [],
  };
}

/** Persist billable seat quantity on the network for subscription/addon tracking. */
async function syncSeatQuantity(tenantId, networkId) {
  const peers = await repo.listPeers(tenantId);
  const seats = peers.filter((p) => p.status !== 'revoked').length;
  const billing = vpnBillingSummary(seats, 'month');
  const network = await repo.getNetwork(networkId);
  if (network) {
    await repo.updateNetwork(networkId, {
      metadata: {
        ...(network.metadata || {}),
        billing: {
          pricingModel: 'per_user',
          quantity: seats,
          unitPriceCents: billing.unitPriceCents,
          monthlyTotalCents: billing.totalCents,
          currency: billing.currency,
          label: billing.label,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  }
  return billing;
}

async function status(tenantId) {
  const env = vpnEnvDefaults();
  const row = await repo.getNetworkByTenant(tenantId);
  const network = row ? repo.publicNetwork(row) : null;
  const peers = network ? await repo.listPeers(tenantId) : [];
  const billablePeers = peers.filter((p) => p.status !== 'revoked');
  const billing = vpnBillingSummary(billablePeers.length, 'month');
  const addon = addonCatalog();
  return {
    enabled: Boolean(network && network.status === 'active'),
    addon,
    billing,
    network,
    peers: billablePeers.map((p) => ({
      ...p,
      billable: true,
      unitPriceCents: billing.unitPriceCents,
    })),
    seats: billing.seats,
    quantity: billing.quantity,
    endpointConfigured: Boolean(env.endpoint && env.serverPublicKey),
    mock: network ? Boolean(network.mock) : env.mock,
    subnetDefault: env.subnet,
  };
}

async function enable({ tenantId, createdBy, name = 'default' }) {
  const existing = await repo.getNetworkByTenant(tenantId, name);
  if (existing && existing.status === 'active') {
    return repo.publicNetwork(existing);
  }
  if (existing) {
    return repo.updateNetwork(existing.id, { status: 'active' });
  }

  const env = vpnEnvDefaults();
  let serverPublicKey = env.serverPublicKey;
  let serverPrivateKey = null;
  let mock = env.mock;

  if (!serverPublicKey) {
    const kp = generateKeyPair();
    serverPublicKey = kp.publicKey;
    serverPrivateKey = kp.privateKey;
    mock = true;
  }

  const network = await repo.insertNetwork({
    id: store.newId('vpnnet'),
    tenantId,
    name,
    subnetCidr: env.subnet,
    serverPublicKey,
    serverEndpoint: env.endpoint,
    dns: env.dns,
    status: 'active',
    createdBy,
    metadata: {
      mock,
      billing: {
        pricingModel: 'per_user',
        quantity: 0,
        unitPriceCents: unitAmountCents(getAddon('vpn'), 'month'),
        monthlyTotalCents: 0,
        currency: 'eur',
        label: vpnBillingSummary(0).label,
      },
      ...(serverPrivateKey
        ? { note: 'Mock WG server keypair — set WIREGUARD_ENDPOINT + WIREGUARD_SERVER_PUBLIC_KEY for production' }
        : {}),
    },
  });

  // Keep mock server private key only in metadata encrypted path is overkill for mock;
  // do not expose in publicNetwork (already stripped). Store encrypted on metadata for ops.
  if (serverPrivateKey && mock) {
    const { encryptSecret } = require('../secrets');
    await repo.updateNetwork(network.id, {
      metadata: {
        ...network.metadata,
        mock: true,
        serverPrivateKeyEnc: encryptSecret(serverPrivateKey),
      },
    });
    return (await status(tenantId)).network;
  }

  return network;
}

async function createPeer({
  tenantId,
  userId,
  createdBy,
  name,
  serverId,
  allowedIps,
}) {
  if (!name || !String(name).trim()) {
    throw fail(400, 'validation', 'Peer name required');
  }

  let networkRow = await repo.getNetworkByTenant(tenantId);
  if (!networkRow || networkRow.status !== 'active') {
    await enable({ tenantId, createdBy });
    networkRow = await repo.getNetworkByTenant(tenantId);
  }
  if (!networkRow) throw fail(500, 'vpn_enable_failed', 'VPN network missing');

  // Strict per-user: every new active peer is one billable seat
  const beforePeers = await repo.listPeers(tenantId);
  const seatsBefore = beforePeers.filter((p) => p.status !== 'revoked').length;
  const billingBefore = vpnBillingSummary(seatsBefore, 'month');
  const billingAfterPreview = vpnBillingSummary(seatsBefore + 1, 'month');

  let routeTarget = null;
  if (serverId) {
    const server = await cloudRepo.getServer(serverId);
    if (!server || server.tenant_id !== tenantId) {
      throw fail(404, 'server_not_found', 'Linked server not found');
    }
    routeTarget = server.ipv4 || server.ipv6 || null;
  }

  const used = await repo.listPeerAddressHostParts(networkRow.id);
  const addressCidr = nextClientAddress(networkRow.subnet_cidr, used);
  const kp = generateKeyPair();

  const env = vpnEnvDefaults();
  const subnetAllowed = networkRow.subnet_cidr || env.subnet;
  let allowed = allowedIps || subnetAllowed;
  if (routeTarget && !String(allowed).includes(routeTarget)) {
    allowed = `${allowed}, ${routeTarget}/32`;
  }

  const peer = await repo.insertPeer({
    id: store.newId('vpnpeer'),
    tenantId,
    networkId: networkRow.id,
    userId: userId || createdBy,
    serverId: serverId || null,
    name: String(name).trim(),
    publicKey: kp.publicKey,
    privateKey: kp.privateKey,
    addressCidr,
    allowedIps: allowed,
    persistentKeepalive: 25,
    createdBy,
    metadata: {
      ...(routeTarget ? { routeTarget } : {}),
      billable: true,
      unitPriceCents: billingAfterPreview.unitPriceCents,
    },
  });

  const billing = await syncSeatQuantity(tenantId, networkRow.id);
  const config = await peerConfig(tenantId, peer.id);
  return {
    peer: { ...peer, privateKey: undefined, billable: true },
    config,
    billing,
    billingDelta: {
      seatsBefore,
      seatsAfter: billing.seats,
      addedUnitCents: billing.unitPriceCents,
      previousTotalCents: billingBefore.totalCents,
      newTotalCents: billing.totalCents,
      warning: `Ek aylık maliyet: +€${(billing.unitPriceCents / 100).toFixed(2)}/ay. Yeni toplam: ${billing.label}`,
    },
  };
}

async function peerConfig(tenantId, peerId) {
  const row = await repo.getPeer(peerId);
  if (!row || row.tenant_id !== tenantId) {
    throw fail(404, 'peer_not_found', 'VPN peer not found');
  }
  if (row.status === 'revoked') {
    throw fail(410, 'peer_revoked', 'VPN peer revoked');
  }
  const network = await repo.getNetwork(row.network_id);
  if (!network) throw fail(404, 'network_not_found', 'VPN network not found');

  let privateKey = null;
  try {
    const { decryptSecret } = require('../secrets');
    privateKey = row.private_key_enc
      ? decryptSecret(row.private_key_enc)
      : null;
  } catch {
    privateKey = null;
  }
  if (!privateKey) {
    throw fail(
      409,
      'private_key_unavailable',
      'Client private key no longer available — create a new peer'
    );
  }

  const env = vpnEnvDefaults();
  const endpoint = network.server_endpoint || env.endpoint;
  const serverPublicKey =
    network.server_public_key || env.serverPublicKey;
  if (!serverPublicKey) {
    throw fail(500, 'server_key_missing', 'VPN server public key missing');
  }

  const text = buildClientConfig({
    privateKey,
    addressCidr: row.address_cidr,
    dns: network.dns || env.dns,
    serverPublicKey,
    endpoint,
    allowedIps: row.allowed_ips,
    persistentKeepalive: row.persistent_keepalive ?? 25,
  });

  const qrDataUrl = await configToQrDataUrl(text);
  return {
    peerId: row.id,
    name: row.name,
    filename: `${row.name.replace(/[^\w.-]+/g, '_')}.conf`,
    config: text,
    qrDataUrl,
    mock: Boolean(network.metadata?.mock) || !endpoint,
    endpoint: endpoint || null,
    addressCidr: row.address_cidr,
    serverId: row.server_id,
  };
}

async function revokePeer(tenantId, peerId) {
  const row = await repo.getPeer(peerId);
  if (!row || row.tenant_id !== tenantId) {
    throw fail(404, 'peer_not_found', 'VPN peer not found');
  }
  const revoked = await repo.revokePeer(peerId);
  const billing = await syncSeatQuantity(tenantId, row.network_id);
  return { ...revoked, billing };
}

async function listPeers(tenantId) {
  return repo.listPeers(tenantId);
}

module.exports = {
  status,
  enable,
  createPeer,
  peerConfig,
  revokePeer,
  listPeers,
  addonCatalog,
  nextClientAddress,
  generateKeyPair,
  syncSeatQuantity,
};
