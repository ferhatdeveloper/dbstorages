/**
 * VPN networks / peers persistence — Postgres meta or in-memory store.
 */
const { isMetaReady, getMetaPool } = require('../../db');
const store = require('../../store');
const { encryptSecret, decryptSecret } = require('../secrets');

function mem() {
  if (!store.vpnNetworks) store.vpnNetworks = [];
  if (!store.vpnPeers) store.vpnPeers = [];
  return store;
}

function nowIso() {
  return new Date().toISOString();
}

function publicPeer(row, { includePrivateKey = false } = {}) {
  if (!row) return null;
  const out = {
    id: row.id,
    tenantId: row.tenant_id,
    networkId: row.network_id,
    userId: row.user_id,
    serverId: row.server_id,
    name: row.name,
    publicKey: row.public_key,
    addressCidr: row.address_cidr,
    allowedIps: row.allowed_ips,
    persistentKeepalive: row.persistent_keepalive,
    status: row.status,
    revokedAt: row.revoked_at,
    metadata: row.metadata || {},
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  if (includePrivateKey && row.private_key_enc) {
    try {
      out.privateKey = decryptSecret(row.private_key_enc);
    } catch {
      out.privateKey = null;
    }
  }
  return out;
}

function publicNetwork(row) {
  if (!row) return null;
  const meta = { ...(row.metadata || {}) };
  delete meta.serverPrivateKeyEnc;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    subnetCidr: row.subnet_cidr,
    serverPublicKey: row.server_public_key,
    serverEndpoint: row.server_endpoint,
    dns: row.dns,
    status: row.status,
    enabledAt: row.enabled_at,
    metadata: meta,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    mock: Boolean(meta.mock),
  };
}

async function insertNetwork(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    name: data.name || 'default',
    subnet_cidr: data.subnetCidr || '10.66.0.0/24',
    server_public_key: data.serverPublicKey || null,
    server_endpoint: data.serverEndpoint || null,
    dns: data.dns || '1.1.1.1',
    status: data.status || 'active',
    enabled_at: data.enabledAt || nowIso(),
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO vpn_networks
        (id, tenant_id, name, subnet_cidr, server_public_key, server_endpoint,
         dns, status, enabled_at, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11)`,
      [
        row.id,
        row.tenant_id,
        row.name,
        row.subnet_cidr,
        row.server_public_key,
        row.server_endpoint,
        row.dns,
        row.status,
        row.enabled_at,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().vpnNetworks.push(row);
  }
  return publicNetwork(row);
}

async function getNetworkByTenant(tenantId, name = 'default') {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM vpn_networks WHERE tenant_id = $1 AND name = $2 LIMIT 1`,
      [tenantId, name]
    );
    return rows[0] || null;
  }
  return (
    mem().vpnNetworks.find(
      (n) => n.tenant_id === tenantId && n.name === name
    ) || null
  );
}

async function getNetwork(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM vpn_networks WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().vpnNetworks.find((n) => n.id === id) || null;
}

async function updateNetwork(id, patch) {
  const existing = await getNetwork(id);
  if (!existing) return null;
  const next = {
    ...existing,
    name: patch.name != null ? patch.name : existing.name,
    subnet_cidr:
      patch.subnetCidr != null ? patch.subnetCidr : existing.subnet_cidr,
    server_public_key:
      patch.serverPublicKey != null
        ? patch.serverPublicKey
        : existing.server_public_key,
    server_endpoint:
      patch.serverEndpoint != null
        ? patch.serverEndpoint
        : existing.server_endpoint,
    dns: patch.dns != null ? patch.dns : existing.dns,
    status: patch.status != null ? patch.status : existing.status,
    metadata:
      patch.metadata != null
        ? { ...(existing.metadata || {}), ...patch.metadata }
        : existing.metadata,
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE vpn_networks SET
        name=$2, subnet_cidr=$3, server_public_key=$4, server_endpoint=$5,
        dns=$6, status=$7, metadata=$8::jsonb, updated_at=$9
       WHERE id=$1`,
      [
        id,
        next.name,
        next.subnet_cidr,
        next.server_public_key,
        next.server_endpoint,
        next.dns,
        next.status,
        JSON.stringify(next.metadata || {}),
        next.updated_at,
      ]
    );
  } else {
    const idx = mem().vpnNetworks.findIndex((n) => n.id === id);
    if (idx >= 0) mem().vpnNetworks[idx] = next;
  }
  return publicNetwork(next);
}

async function insertPeer(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    network_id: data.networkId,
    user_id: data.userId || null,
    server_id: data.serverId || null,
    name: data.name,
    public_key: data.publicKey,
    private_key_enc: data.privateKey ? encryptSecret(data.privateKey) : null,
    address_cidr: data.addressCidr,
    allowed_ips: data.allowedIps || '10.66.0.0/24',
    persistent_keepalive: data.persistentKeepalive ?? 25,
    status: data.status || 'active',
    revoked_at: null,
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO vpn_peers
        (id, tenant_id, network_id, user_id, server_id, name, public_key,
         private_key_enc, address_cidr, allowed_ips, persistent_keepalive,
         status, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
      [
        row.id,
        row.tenant_id,
        row.network_id,
        row.user_id,
        row.server_id,
        row.name,
        row.public_key,
        row.private_key_enc,
        row.address_cidr,
        row.allowed_ips,
        row.persistent_keepalive,
        row.status,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().vpnPeers.push(row);
  }
  return publicPeer(row, { includePrivateKey: true });
}

async function listPeers(tenantId, { includeRevoked = false } = {}) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      includeRevoked
        ? `SELECT * FROM vpn_peers WHERE tenant_id = $1 ORDER BY created_at DESC`
        : `SELECT * FROM vpn_peers WHERE tenant_id = $1 AND status <> 'revoked' ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows.map((r) => publicPeer(r));
  }
  return mem()
    .vpnPeers.filter(
      (p) =>
        p.tenant_id === tenantId &&
        (includeRevoked || p.status !== 'revoked')
    )
    .map((r) => publicPeer(r))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function getPeer(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM vpn_peers WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().vpnPeers.find((p) => p.id === id) || null;
}

async function getPeerPublic(id, opts) {
  return publicPeer(await getPeer(id), opts);
}

async function listPeerAddressHostParts(networkId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT address_cidr FROM vpn_peers
       WHERE network_id = $1 AND status <> 'revoked'`,
      [networkId]
    );
    return rows.map((r) => r.address_cidr);
  }
  return mem()
    .vpnPeers.filter(
      (p) => p.network_id === networkId && p.status !== 'revoked'
    )
    .map((p) => p.address_cidr);
}

async function revokePeer(id) {
  const existing = await getPeer(id);
  if (!existing) return null;
  const revokedAt = nowIso();
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE vpn_peers SET status='revoked', revoked_at=$2, updated_at=$2,
        private_key_enc=NULL WHERE id=$1`,
      [id, revokedAt]
    );
  } else {
    existing.status = 'revoked';
    existing.revoked_at = revokedAt;
    existing.updated_at = revokedAt;
    existing.private_key_enc = null;
  }
  return publicPeer({ ...existing, status: 'revoked', revoked_at: revokedAt });
}

module.exports = {
  insertNetwork,
  getNetworkByTenant,
  getNetwork,
  updateNetwork,
  publicNetwork,
  insertPeer,
  listPeers,
  getPeer,
  getPeerPublic,
  listPeerAddressHostParts,
  revokePeer,
  publicPeer,
};
