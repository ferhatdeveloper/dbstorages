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
 * @deprecated Do NOT rewire a process-wide tenant pool (multi-tenant unsafe).
 * Warms the per-connectionString pool cache only.
 */
async function setTenantConnection(connectionString) {
  if (!connectionString) return false;
  try {
    const pool = getPoolForConnection(connectionString);
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.warn('[pg] setTenantConnection (pool warm) failed:', err.message);
    return false;
  }
}

function getPoolForConnection(connectionString) {
  if (!connectionString) return getTenantPool();
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

function poolError(status, message, code) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Resolve which Postgres pool to use for Studio / REST APIs.
 * - instanceId: requires userId + membership (source of truth)
 * - userId only: latest ready instance the user can access
 * - neither: demo tenant pool (dev fallback only)
 */
async function resolveTenantPool({ instanceId, userId, requireAuth = false } = {}) {
  if (requireAuth && !userId) {
    throw poolError(401, 'Authentication required', 'unauthorized');
  }

  if (!metaReady || !metaPool) {
    if (instanceId && requireAuth) {
      throw poolError(503, 'Meta DB unavailable for membership check', 'db_unavailable');
    }
    return getTenantPool();
  }

  try {
    if (instanceId) {
      if (!userId) {
        throw poolError(401, 'Authentication required for instance access', 'unauthorized');
      }
      const { rows } = await metaPool.query(
        `SELECT i.*
         FROM instances i
         JOIN projects p ON p.id = i.project_id
         JOIN memberships m ON m.tenant_id = p.tenant_id
         WHERE i.id = $1
           AND m.user_id = $2
           AND i.status = 'ready'
         LIMIT 1`,
        [instanceId, userId]
      );
      if (!rows[0]) {
        throw poolError(403, 'Instance not found or access denied', 'forbidden');
      }
      const conn = internalConnFromInstanceRow(rows[0]);
      if (conn) return getPoolForConnection(conn);
      throw poolError(503, 'Instance has no connection string', 'db_unavailable');
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
    if (err.status) throw err;
    console.warn('[pg] resolveTenantPool:', err.message);
  }

  if (requireAuth) {
    throw poolError(404, 'No ready instance for this user', 'not_found');
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
  internalConnFromInstanceRow,
  META_URL,
  TENANT_URL,
};
