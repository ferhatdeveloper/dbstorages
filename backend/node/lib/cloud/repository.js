/**
 * Cloud entity persistence — Postgres meta when ready, else in-memory store.
 */
const { isMetaReady, getMetaPool } = require('../db');
const store = require('../store');
const { encryptSecret, decryptSecret } = require('./secrets');

function mem() {
  if (!store.cloudProviders) store.cloudProviders = [];
  if (!store.cloudServers) store.cloudServers = [];
  if (!store.cloudVolumes) store.cloudVolumes = [];
  if (!store.cloudFirewalls) store.cloudFirewalls = [];
  if (!store.cloudSnapshots) store.cloudSnapshots = [];
  if (!store.cloudSshKeys) store.cloudSshKeys = [];
  if (!store.cloudNetworks) store.cloudNetworks = [];
  if (!store.cloudOperations) store.cloudOperations = [];
  return store;
}

function nowIso() {
  return new Date().toISOString();
}

function publicProvider(row) {
  if (!row) return null;
  const { api_key_enc, ...rest } = row;
  const cfg =
    rest.config && typeof rest.config === 'object' ? { ...rest.config } : {};
  const envName = cfg.envFallback || null;
  const liveEnv = Boolean(envName && process.env[envName]);
  if (envName) {
    cfg.envFallback = envName;
    cfg.hasEnvToken = liveEnv || Boolean(cfg.hasEnvToken);
  }
  return {
    ...rest,
    config: cfg,
    hasApiKey: Boolean(api_key_enc),
  };
}

async function insertProvider(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    name: data.name,
    slug: data.slug,
    api_key_enc: data.apiKey ? encryptSecret(data.apiKey) : null,
    config: data.config || {},
    status: data.status || 'active',
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_providers
        (id, tenant_id, project_id, name, slug, api_key_enc, config, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.name,
        row.slug,
        row.api_key_enc,
        JSON.stringify(row.config),
        row.status,
        row.created_by,
      ]
    );
  } else {
    mem().cloudProviders.push(row);
  }
  return publicProvider(row);
}

async function listProviders(tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_providers WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows.map(publicProvider);
  }
  return mem()
    .cloudProviders.filter((p) => p.tenant_id === tenantId)
    .map(publicProvider);
}

async function getProvider(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_providers WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudProviders.find((p) => p.id === id) || null;
}

async function getProviderDecryptedKey(row) {
  if (!row) return null;
  if (row.api_key_enc) return decryptSecret(row.api_key_enc);
  return null;
}

async function updateProvider(id, patch = {}) {
  const row = await getProvider(id);
  if (!row) return null;
  if (patch.config !== undefined) row.config = patch.config;
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.apiKey !== undefined) {
    row.api_key_enc = patch.apiKey ? encryptSecret(patch.apiKey) : null;
  }
  row.updated_at = nowIso();
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE cloud_providers
       SET name = $2, status = $3, config = $4::jsonb, api_key_enc = $5, updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        row.name,
        row.status,
        JSON.stringify(row.config || {}),
        row.api_key_enc,
      ]
    );
  }
  return publicProvider(row);
}

async function insertServer(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    name: data.name,
    external_id: data.externalId || null,
    status: data.status || 'pending',
    server_type: data.serverType || null,
    image: data.image || null,
    location: data.location || null,
    ipv4: data.ipv4 || null,
    ipv6: data.ipv6 || null,
    labels: data.labels || {},
    user_data: data.userData || null,
    metadata: data.metadata || {},
    cost_provider:
      data.costProvider != null ? Number(data.costProvider) : null,
    price_retail:
      data.priceRetail != null ? Number(data.priceRetail) : null,
    currency: data.currency || 'EUR',
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_servers
        (id, tenant_id, project_id, provider_id, name, external_id, status,
         server_type, image, location, ipv4, ipv6, labels, user_data, metadata,
         cost_provider, price_retail, currency, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15::jsonb,$16,$17,$18,$19)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.name,
        row.external_id,
        row.status,
        row.server_type,
        row.image,
        row.location,
        row.ipv4,
        row.ipv6,
        JSON.stringify(row.labels),
        row.user_data,
        JSON.stringify(row.metadata),
        row.cost_provider,
        row.price_retail,
        row.currency,
        row.created_by,
      ]
    );
  } else {
    mem().cloudServers.push(row);
  }
  return row;
}

async function updateServer(id, patch) {
  if (isMetaReady()) {
    const fields = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      const col = k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
      const map = {
        externalId: 'external_id',
        serverType: 'server_type',
        userData: 'user_data',
        updatedAt: 'updated_at',
        costProvider: 'cost_provider',
        priceRetail: 'price_retail',
      };
      const column = map[k] || col;
      if (column === 'labels' || column === 'metadata') {
        fields.push(`${column} = $${i}::jsonb`);
        vals.push(JSON.stringify(v));
      } else {
        fields.push(`${column} = $${i}`);
        vals.push(v);
      }
      i += 1;
    }
    fields.push(`updated_at = NOW()`);
    vals.push(id);
    await getMetaPool().query(
      `UPDATE cloud_servers SET ${fields.join(', ')} WHERE id = $${i}`,
      vals
    );
    return getServer(id);
  }
  const row = mem().cloudServers.find((s) => s.id === id);
  if (!row) return null;
  Object.assign(row, {
    external_id: patch.externalId ?? row.external_id,
    status: patch.status ?? row.status,
    ipv4: patch.ipv4 ?? row.ipv4,
    ipv6: patch.ipv6 ?? row.ipv6,
    server_type: patch.serverType ?? row.server_type,
    name: patch.name ?? row.name,
    image: patch.image ?? row.image,
    labels: patch.labels ?? row.labels,
    metadata: patch.metadata ?? row.metadata,
    updated_at: nowIso(),
  });
  return row;
}

async function getServer(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_servers WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudServers.find((s) => s.id === id) || null;
}

async function listServers(tenantId, { projectId } = {}) {
  if (isMetaReady()) {
    const params = [tenantId];
    let sql = `SELECT * FROM cloud_servers WHERE tenant_id = $1`;
    if (projectId) {
      params.push(projectId);
      sql += ` AND project_id = $2`;
    }
    sql += ` ORDER BY created_at DESC`;
    const { rows } = await getMetaPool().query(sql, params);
    return rows;
  }
  return mem().cloudServers.filter(
    (s) =>
      s.tenant_id === tenantId &&
      (!projectId || s.project_id === projectId)
  );
}

async function deleteServerRow(id) {
  if (isMetaReady()) {
    await getMetaPool().query(`DELETE FROM cloud_servers WHERE id = $1`, [id]);
    return;
  }
  const m = mem();
  m.cloudServers = m.cloudServers.filter((s) => s.id !== id);
}

async function insertVolume(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    server_id: data.serverId || null,
    name: data.name,
    external_id: data.externalId || null,
    size_gb: data.sizeGb || 10,
    location: data.location || null,
    status: data.status || 'pending',
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_volumes
        (id, tenant_id, project_id, provider_id, server_id, name, external_id, size_gb, location, status, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.server_id,
        row.name,
        row.external_id,
        row.size_gb,
        row.location,
        row.status,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().cloudVolumes.push(row);
  }
  return row;
}

async function listVolumes(tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_volumes WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }
  return mem().cloudVolumes.filter((v) => v.tenant_id === tenantId);
}

async function getVolume(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_volumes WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudVolumes.find((v) => v.id === id) || null;
}

async function updateVolume(id, patch) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE cloud_volumes SET
        external_id = COALESCE($2, external_id),
        server_id = COALESCE($3, server_id),
        status = COALESCE($4, status),
        metadata = COALESCE($5::jsonb, metadata),
        size_gb = COALESCE($6, size_gb),
        updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        patch.externalId ?? null,
        patch.serverId ?? null,
        patch.status ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
        patch.sizeGb ?? patch.size_gb ?? null,
      ]
    );
    return getVolume(id);
  }
  const row = mem().cloudVolumes.find((v) => v.id === id);
  if (!row) return null;
  Object.assign(row, {
    external_id: patch.externalId ?? row.external_id,
    server_id: 'serverId' in patch ? patch.serverId : row.server_id,
    status: patch.status ?? row.status,
    metadata: patch.metadata ?? row.metadata,
    size_gb: patch.sizeGb ?? patch.size_gb ?? row.size_gb,
    updated_at: nowIso(),
  });
  return row;
}

async function insertFirewall(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    name: data.name,
    external_id: data.externalId || null,
    rules: data.rules || [],
    status: data.status || 'active',
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_firewalls
        (id, tenant_id, project_id, provider_id, name, external_id, rules, status, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.name,
        row.external_id,
        JSON.stringify(row.rules),
        row.status,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().cloudFirewalls.push(row);
  }
  return row;
}

async function listFirewalls(tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_firewalls WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }
  return mem().cloudFirewalls.filter((f) => f.tenant_id === tenantId);
}

async function getFirewall(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_firewalls WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudFirewalls.find((f) => f.id === id) || null;
}

async function deleteFirewallRow(id) {
  if (isMetaReady()) {
    await getMetaPool().query(`DELETE FROM cloud_firewalls WHERE id = $1`, [id]);
    return;
  }
  mem().cloudFirewalls = mem().cloudFirewalls.filter((f) => f.id !== id);
}

async function insertSnapshot(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    server_id: data.serverId || null,
    name: data.name,
    external_id: data.externalId || null,
    status: data.status || 'pending',
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_snapshots
        (id, tenant_id, project_id, provider_id, server_id, name, external_id, status, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.server_id,
        row.name,
        row.external_id,
        row.status,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().cloudSnapshots.push(row);
  }
  return row;
}

async function listSnapshots(tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_snapshots WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }
  return mem().cloudSnapshots.filter((s) => s.tenant_id === tenantId);
}

async function getSnapshot(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_snapshots WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudSnapshots.find((s) => s.id === id) || null;
}

async function updateSnapshot(id, patch) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE cloud_snapshots SET
        external_id = COALESCE($2, external_id),
        status = COALESCE($3, status),
        metadata = COALESCE($4::jsonb, metadata),
        updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        patch.externalId ?? null,
        patch.status ?? null,
        patch.metadata ? JSON.stringify(patch.metadata) : null,
      ]
    );
    return;
  }
  const row = mem().cloudSnapshots.find((s) => s.id === id);
  if (row) {
    Object.assign(row, {
      external_id: patch.externalId ?? row.external_id,
      status: patch.status ?? row.status,
      metadata: patch.metadata ?? row.metadata,
      updated_at: nowIso(),
    });
  }
}

async function insertSshKey(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    name: data.name,
    fingerprint: data.fingerprint || null,
    public_key: data.publicKey,
    external_id: data.externalId || null,
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_ssh_keys
        (id, tenant_id, project_id, provider_id, name, fingerprint, public_key, external_id, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.name,
        row.fingerprint,
        row.public_key,
        row.external_id,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().cloudSshKeys.push(row);
  }
  return row;
}

async function listSshKeys(tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_ssh_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }
  return mem().cloudSshKeys.filter((k) => k.tenant_id === tenantId);
}

async function getSshKey(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_ssh_keys WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudSshKeys.find((k) => k.id === id) || null;
}

async function deleteSshKeyRow(id) {
  if (isMetaReady()) {
    await getMetaPool().query(`DELETE FROM cloud_ssh_keys WHERE id = $1`, [id]);
    return;
  }
  mem().cloudSshKeys = mem().cloudSshKeys.filter((k) => k.id !== id);
}

async function insertNetwork(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    name: data.name,
    external_id: data.externalId || null,
    ip_range: data.ipRange || null,
    status: data.status || 'pending',
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_networks
        (id, tenant_id, project_id, provider_id, name, external_id, ip_range, status, metadata, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.name,
        row.external_id,
        row.ip_range,
        row.status,
        JSON.stringify(row.metadata),
        row.created_by,
      ]
    );
  } else {
    mem().cloudNetworks.push(row);
  }
  return row;
}

async function listNetworks(tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_networks WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }
  return mem().cloudNetworks.filter((n) => n.tenant_id === tenantId);
}

async function insertOperation(data) {
  const row = {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId || null,
    resource_type: data.resourceType,
    resource_id: data.resourceId || null,
    action: data.action,
    status: data.status || 'pending',
    request: data.request || {},
    result: data.result || {},
    error: data.error || null,
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
    completed_at: null,
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO cloud_operations
        (id, tenant_id, project_id, provider_id, resource_type, resource_id, action, status, request, result, error, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12)`,
      [
        row.id,
        row.tenant_id,
        row.project_id,
        row.provider_id,
        row.resource_type,
        row.resource_id,
        row.action,
        row.status,
        JSON.stringify(row.request),
        JSON.stringify(row.result),
        row.error,
        row.created_by,
      ]
    );
  } else {
    mem().cloudOperations.push(row);
  }
  return row;
}

async function updateOperation(id, patch) {
  if (isMetaReady()) {
    await getMetaPool().query(
      `UPDATE cloud_operations SET
        status = COALESCE($2, status),
        result = COALESCE($3::jsonb, result),
        error = COALESCE($4, error),
        resource_id = COALESCE($5, resource_id),
        completed_at = CASE WHEN $2 IN ('completed','failed') THEN NOW() ELSE completed_at END,
        updated_at = NOW()
       WHERE id = $1`,
      [
        id,
        patch.status ?? null,
        patch.result ? JSON.stringify(patch.result) : null,
        patch.error ?? null,
        patch.resourceId ?? null,
      ]
    );
    return getOperation(id);
  }
  const row = mem().cloudOperations.find((o) => o.id === id);
  if (!row) return null;
  Object.assign(row, {
    status: patch.status ?? row.status,
    result: patch.result ?? row.result,
    error: patch.error ?? row.error,
    resource_id: patch.resourceId ?? row.resource_id,
    updated_at: nowIso(),
    completed_at:
      patch.status === 'completed' || patch.status === 'failed'
        ? nowIso()
        : row.completed_at,
  });
  return row;
}

async function getOperation(id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_operations WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem().cloudOperations.find((o) => o.id === id) || null;
}

async function listOperations(tenantId, { limit = 50 } = {}) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM cloud_operations WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return rows;
  }
  return mem()
    .cloudOperations.filter((o) => o.tenant_id === tenantId)
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit);
}

module.exports = {
  insertProvider,
  listProviders,
  getProvider,
  getProviderDecryptedKey,
  updateProvider,
  publicProvider,
  insertServer,
  updateServer,
  getServer,
  listServers,
  deleteServerRow,
  insertVolume,
  listVolumes,
  getVolume,
  updateVolume,
  insertFirewall,
  listFirewalls,
  getFirewall,
  deleteFirewallRow,
  insertSnapshot,
  listSnapshots,
  getSnapshot,
  updateSnapshot,
  insertSshKey,
  listSshKeys,
  getSshKey,
  deleteSshKeyRow,
  insertNetwork,
  listNetworks,
  insertOperation,
  updateOperation,
  getOperation,
  listOperations,
};
