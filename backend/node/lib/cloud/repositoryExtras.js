/**
 * Extra cloud resources: IPs, LBs, placement groups, certificates.
 * In-memory + Postgres when meta DB ready.
 */
const { isMetaReady, getMetaPool } = require('../db');
const store = require('../store');

function mem() {
  if (!store.cloudPrimaryIps) store.cloudPrimaryIps = [];
  if (!store.cloudFloatingIps) store.cloudFloatingIps = [];
  if (!store.cloudLoadBalancers) store.cloudLoadBalancers = [];
  if (!store.cloudPlacementGroups) store.cloudPlacementGroups = [];
  if (!store.cloudCertificates) store.cloudCertificates = [];
  return store;
}

function nowIso() {
  return new Date().toISOString();
}

async function insertGeneric(table, memKey, row, columns, values) {
  if (isMetaReady()) {
    const cols = columns.join(', ');
    const ph = columns.map((_, i) => `$${i + 1}`).join(',');
    await getMetaPool().query(
      `INSERT INTO ${table} (${cols}) VALUES (${ph})`,
      values
    );
  } else {
    mem()[memKey].push(row);
  }
  return row;
}

async function listGeneric(table, memKey, tenantId) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM ${table} WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return rows;
  }
  return mem()[memKey].filter((r) => r.tenant_id === tenantId);
}

async function getGeneric(table, memKey, id) {
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT * FROM ${table} WHERE id = $1 LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  }
  return mem()[memKey].find((r) => r.id === id) || null;
}

async function updateGeneric(table, memKey, id, patch) {
  const row = await getGeneric(table, memKey, id);
  if (!row) return null;
  const next = { ...row, ...patch, updated_at: nowIso() };
  if (isMetaReady()) {
    const fields = [];
    const vals = [];
    let i = 1;
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'metadata' || k === 'config') {
        fields.push(`${k} = $${i}::jsonb`);
        vals.push(JSON.stringify(v));
      } else {
        fields.push(`${k} = $${i}`);
        vals.push(v);
      }
      i += 1;
    }
    fields.push('updated_at = NOW()');
    vals.push(id);
    await getMetaPool().query(
      `UPDATE ${table} SET ${fields.join(', ')} WHERE id = $${i}`,
      vals
    );
  } else {
    const idx = mem()[memKey].findIndex((r) => r.id === id);
    if (idx >= 0) mem()[memKey][idx] = next;
  }
  return next;
}

async function deleteGeneric(table, memKey, id) {
  if (isMetaReady()) {
    await getMetaPool().query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  } else {
    const arr = mem()[memKey];
    const idx = arr.findIndex((r) => r.id === id);
    if (idx >= 0) arr.splice(idx, 1);
  }
  return { ok: true };
}

function baseRow(data) {
  return {
    id: data.id,
    tenant_id: data.tenantId,
    project_id: data.projectId || null,
    provider_id: data.providerId,
    name: data.name,
    external_id: data.externalId || null,
    status: data.status || 'pending',
    metadata: data.metadata || {},
    created_by: data.createdBy || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
}

async function insertPrimaryIp(data) {
  const row = {
    ...baseRow(data),
    ip: data.ip || null,
    type: data.type || 'ipv4',
    server_id: data.serverId || null,
  };
  return insertGeneric(
    'cloud_primary_ips',
    'cloudPrimaryIps',
    row,
    [
      'id', 'tenant_id', 'project_id', 'provider_id', 'name', 'external_id',
      'ip', 'type', 'server_id', 'status', 'metadata', 'created_by',
    ],
    [
      row.id, row.tenant_id, row.project_id, row.provider_id, row.name,
      row.external_id, row.ip, row.type, row.server_id, row.status,
      JSON.stringify(row.metadata), row.created_by,
    ]
  );
}

async function insertFloatingIp(data) {
  const row = {
    ...baseRow(data),
    ip: data.ip || null,
    type: data.type || 'ipv4',
    location: data.location || null,
    server_id: data.serverId || null,
  };
  return insertGeneric(
    'cloud_floating_ips',
    'cloudFloatingIps',
    row,
    [
      'id', 'tenant_id', 'project_id', 'provider_id', 'name', 'external_id',
      'ip', 'type', 'location', 'server_id', 'status', 'metadata', 'created_by',
    ],
    [
      row.id, row.tenant_id, row.project_id, row.provider_id, row.name,
      row.external_id, row.ip, row.type, row.location, row.server_id,
      row.status, JSON.stringify(row.metadata), row.created_by,
    ]
  );
}

async function insertLoadBalancer(data) {
  const row = {
    ...baseRow(data),
    lb_type: data.lbType || 'lb11',
    location: data.location || null,
    public_ipv4: data.publicIpv4 || null,
  };
  return insertGeneric(
    'cloud_load_balancers',
    'cloudLoadBalancers',
    row,
    [
      'id', 'tenant_id', 'project_id', 'provider_id', 'name', 'external_id',
      'lb_type', 'location', 'public_ipv4', 'status', 'metadata', 'created_by',
    ],
    [
      row.id, row.tenant_id, row.project_id, row.provider_id, row.name,
      row.external_id, row.lb_type, row.location, row.public_ipv4,
      row.status, JSON.stringify(row.metadata), row.created_by,
    ]
  );
}

async function insertPlacementGroup(data) {
  const row = {
    ...baseRow(data),
    pg_type: data.pgType || 'spread',
  };
  return insertGeneric(
    'cloud_placement_groups',
    'cloudPlacementGroups',
    row,
    [
      'id', 'tenant_id', 'project_id', 'provider_id', 'name', 'external_id',
      'pg_type', 'status', 'metadata', 'created_by',
    ],
    [
      row.id, row.tenant_id, row.project_id, row.provider_id, row.name,
      row.external_id, row.pg_type, row.status,
      JSON.stringify(row.metadata), row.created_by,
    ]
  );
}

async function insertCertificate(data) {
  const row = {
    ...baseRow(data),
    cert_type: data.certType || 'uploaded',
    domain_names: data.domainNames || [],
  };
  return insertGeneric(
    'cloud_certificates',
    'cloudCertificates',
    row,
    [
      'id', 'tenant_id', 'project_id', 'provider_id', 'name', 'external_id',
      'cert_type', 'domain_names', 'status', 'metadata', 'created_by',
    ],
    [
      row.id, row.tenant_id, row.project_id, row.provider_id, row.name,
      row.external_id, row.cert_type, JSON.stringify(row.domain_names),
      row.status, JSON.stringify(row.metadata), row.created_by,
    ]
  );
}

module.exports = {
  insertPrimaryIp,
  listPrimaryIps: (t) => listGeneric('cloud_primary_ips', 'cloudPrimaryIps', t),
  getPrimaryIp: (id) => getGeneric('cloud_primary_ips', 'cloudPrimaryIps', id),
  updatePrimaryIp: (id, p) =>
    updateGeneric('cloud_primary_ips', 'cloudPrimaryIps', id, p),
  deletePrimaryIpRow: (id) =>
    deleteGeneric('cloud_primary_ips', 'cloudPrimaryIps', id),

  insertFloatingIp,
  listFloatingIps: (t) => listGeneric('cloud_floating_ips', 'cloudFloatingIps', t),
  getFloatingIp: (id) => getGeneric('cloud_floating_ips', 'cloudFloatingIps', id),
  updateFloatingIp: (id, p) =>
    updateGeneric('cloud_floating_ips', 'cloudFloatingIps', id, p),
  deleteFloatingIpRow: (id) =>
    deleteGeneric('cloud_floating_ips', 'cloudFloatingIps', id),

  insertLoadBalancer,
  listLoadBalancers: (t) =>
    listGeneric('cloud_load_balancers', 'cloudLoadBalancers', t),
  getLoadBalancer: (id) =>
    getGeneric('cloud_load_balancers', 'cloudLoadBalancers', id),
  updateLoadBalancer: (id, p) =>
    updateGeneric('cloud_load_balancers', 'cloudLoadBalancers', id, p),
  deleteLoadBalancerRow: (id) =>
    deleteGeneric('cloud_load_balancers', 'cloudLoadBalancers', id),

  insertPlacementGroup,
  listPlacementGroups: (t) =>
    listGeneric('cloud_placement_groups', 'cloudPlacementGroups', t),
  getPlacementGroup: (id) =>
    getGeneric('cloud_placement_groups', 'cloudPlacementGroups', id),
  updatePlacementGroup: (id, p) =>
    updateGeneric('cloud_placement_groups', 'cloudPlacementGroups', id, p),
  deletePlacementGroupRow: (id) =>
    deleteGeneric('cloud_placement_groups', 'cloudPlacementGroups', id),

  insertCertificate,
  listCertificates: (t) =>
    listGeneric('cloud_certificates', 'cloudCertificates', t),
  getCertificate: (id) => getGeneric('cloud_certificates', 'cloudCertificates', id),
  updateCertificate: (id, p) =>
    updateGeneric('cloud_certificates', 'cloudCertificates', id, p),
  deleteCertificateRow: (id) =>
    deleteGeneric('cloud_certificates', 'cloudCertificates', id),
};
