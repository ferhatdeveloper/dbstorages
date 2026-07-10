const { Pool } = require('pg');

const META_URL =
  process.env.DATABASE_URL ||
  'postgresql://graphcore:graphcore@localhost:5432/graphcore_meta';

const TENANT_URL =
  process.env.TENANT_DATABASE_URL ||
  'postgresql://graphcore:graphcore@localhost:5432/graphcore_demo';

let metaPool = null;
let tenantPool = null;
let metaReady = false;
let tenantReady = false;

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
    console.log('[pg] meta database connected');
  } catch (err) {
    metaReady = false;
    console.warn('[pg] meta database unavailable — using in-memory store:', err.message);
  }

  try {
    await tenantPool.query('SELECT 1');
    tenantReady = true;
    console.log('[pg] tenant database connected');
  } catch (err) {
    tenantReady = false;
    console.warn('[pg] tenant database unavailable — SQL/table APIs will error:', err.message);
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

module.exports = {
  initDb,
  getMetaPool,
  getTenantPool,
  isMetaReady,
  isTenantReady,
  META_URL,
  TENANT_URL,
};
