const { Pool } = require('pg');
const { ensureMetaSchema } = require('./migrate');

const META_URL =
  process.env.DATABASE_URL ||
  'postgresql://graphcore:graphcore@localhost:5432/graphcore_meta';

const TENANT_URL =
  process.env.TENANT_DATABASE_URL ||
  'postgresql://graphcore:graphcore@localhost:5432/graphcore_demo';

const DATABASE_URL_EXPLICIT = Boolean(process.env.DATABASE_URL);
const REQUIRE_META_DB =
  process.env.REQUIRE_META_DB === '1' || process.env.NODE_ENV === 'production';

let metaPool = null;
let tenantPool = null;
let metaReady = false;
let tenantReady = false;
let activeTenantUrl = TENANT_URL;

/** @type {Map<string, import('pg').Pool>} */
const instancePools = new Map();

function createPool(connectionString, label) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  pool.on('error', (err) => {
    console.error(`[pg:${label}] idle client error`, err.message);
  });
  return pool;
}

async function initDb() {
  metaPool = createPool(META_URL, 'meta');
  tenantPool = createPool(TENANT_URL, 'tenant');
  activeTenantUrl = TENANT_URL;

  try {
    await metaPool.query('SELECT 1');
    metaReady = true;
    await ensureMetaSchema(metaPool);
    console.log('[pg] meta database connected');
  } catch (err) {
    metaReady = false;
    if (DATABASE_URL_EXPLICIT && REQUIRE_META_DB) {
      console.error(
        '[pg] FATAL: DATABASE_URL is set but meta DB is unreachable — refusing silent in-memory fallback in production'
      );
      console.error('[pg]', err.message);
      process.exit(1);
    }
    if (DATABASE_URL_EXPLICIT) {
      console.warn(
        '[pg] DATABASE_URL set but unreachable — in-memory fallback (dev only):',
        err.message
      );
    } else {
      console.warn(
        '[pg] meta database unavailable — using in-memory store:',
        err.message
      );
    }
  }

  try {
    await tenantPool.query('SELECT 1');
    tenantReady = true;
    console.log('[pg] tenant database connected');
  } catch (err) {
    tenantReady = false;
    console.warn(
      '[pg] tenant database unavailable — SQL/table APIs will error:',
      err.message
    );
  }

  return { metaReady, tenantReady };
}

function getMetaPool() {
  return metaPool;
}

function getTenantPool() {
  return tenantPool;
}

function isMetaReady() {
  return metaReady;
}

function isTenantReady() {
  return tenantReady;
}

/**
 * Point the default tenant pool at a provisioned instance (Studio default).
 */
async function setTenantConnection(connectionString) {
  if (!connectionString) return false;
  if (connectionString === activeTenantUrl && tenantReady) return true;

  const next = createPool(connectionString, 'tenant');
  try {
    await next.query('SELECT 1');
  } catch (err) {
    await next.end().catch(() => {});
    console.warn('[pg] setTenantConnection failed:', err.message);
    return false;
  }

  const prev = tenantPool;
  tenantPool = next;
  activeTenantUrl = connectionString;
  tenantReady = true;
  if (prev) await prev.end().catch(() => {});
  console.log('[pg] tenant pool rewired to provisioned instance');
  return true;
}

function getPoolForConnection(connectionString) {
  if (!connectionString) return getTenantPool();
  if (connectionString === activeTenantUrl) return getTenantPool();
  if (!instancePools.has(connectionString)) {
    instancePools.set(connectionString, createPool(connectionString, 'instance'));
  }
  return instancePools.get(connectionString);
}

/**
 * Build a connection string the API can reach (Docker-internal host),
 * while instances.connection_string stays customer-facing (public host).
 */
function internalConnFromInstanceRow(row) {
  if (!row?.database_name || !row?.username || !row?.password) {
    return row?.connection_string || null;
  }
  try {
    const admin = new URL(META_URL);
    const encUser = encodeURIComponent(row.username);
    const encPass = encodeURIComponent(row.password);
    return `postgresql://${encUser}:${encPass}@${admin.hostname}:${admin.port || 5432}/${row.database_name}`;
  } catch {
    return row.connection_string || null;
  }
}

/**
 * Resolve which Postgres pool to use for Studio SQL/table APIs.
 * Prefer explicit instanceId → user's latest ready instance → default tenant pool.
 */
async function resolveTenantPool({ instanceId, userId } = {}) {
  if (!metaReady || !metaPool) {
    return getTenantPool();
  }

  try {
    if (instanceId) {
      const { rows } = await metaPool.query(
        `SELECT * FROM instances
         WHERE id = $1 AND status = 'ready'
         LIMIT 1`,
        [instanceId]
      );
      const conn = internalConnFromInstanceRow(rows[0]);
      if (conn) return getPoolForConnection(conn);
    }

    if (userId) {
      const { rows } = await metaPool.query(
        `SELECT i.*
         FROM instances i
         JOIN projects p ON p.id = i.project_id
         JOIN memberships m ON m.tenant_id = p.tenant_id
         WHERE m.user_id = $1
           AND i.status = 'ready'
           AND i.connection_string IS NOT NULL
         ORDER BY i.created_at DESC
         LIMIT 1`,
        [userId]
      );
      const conn = internalConnFromInstanceRow(rows[0]);
      if (conn) return getPoolForConnection(conn);
    }
  } catch (err) {
    console.warn('[pg] resolveTenantPool:', err.message);
  }

  return getTenantPool();
}

module.exports = {
  initDb,
  getMetaPool,
  getTenantPool,
  isMetaReady,
  isTenantReady,
  setTenantConnection,
  getPoolForConnection,
  resolveTenantPool,
  META_URL,
  TENANT_URL,
};
