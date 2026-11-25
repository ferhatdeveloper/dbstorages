/**
 * Shared-server multi-DB provisioning (MVP).
 * Creates a dedicated Postgres DATABASE + ROLE on the same server
 * (no K8s / container spawn). Stores real credentials on the instance row.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const RLS_TEMPLATE_PATH = path.join(__dirname, '..', 'sql', 'enable_rls_template.sql');
const REALTIME_TEMPLATE_PATH = path.join(
  __dirname,
  '..',
  'sql',
  'realtime_notify_template.sql'
);

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function adminUrl() {
  return (
    process.env.PROVISION_ADMIN_URL ||
    process.env.DATABASE_URL ||
    'postgresql://graphcore:graphcore@localhost:5432/graphcore_meta'
  );
}

function publicHost() {
  return process.env.PROVISION_PUBLIC_HOST || process.env.PROVISION_DB_HOST || 'localhost';
}

function internalHost() {
  return process.env.PROVISION_DB_HOST || 'localhost';
}

function publicPort() {
  return Number(process.env.PROVISION_PUBLIC_PORT || process.env.PROVISION_DB_PORT || 5432);
}

function internalPort() {
  return Number(process.env.PROVISION_DB_PORT || 5432);
}

function makeDbName(instanceId) {
  const suffix = String(instanceId || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(-12)
    .toLowerCase();
  return `gc_${suffix || crypto.randomBytes(6).toString('hex')}`;
}

function makePassword() {
  return crypto.randomBytes(18).toString('base64url');
}

function buildConnString({ user, password, host, port, database }) {
  const encUser = encodeURIComponent(user);
  const encPass = encodeURIComponent(password);
  return `postgresql://${encUser}:${encPass}@${host}:${port}/${database}`;
}

/**
 * CREATE DATABASE + ROLE on shared Postgres.
 */
async function provisionPostgresDatabase({ instanceId, planId, databaseName }) {
  const database =
    databaseName && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(databaseName))
      ? String(databaseName)
      : makeDbName(instanceId);
  const username = database;
  const password = makePassword();
  const host = publicHost();
  const port = publicPort();

  const adminParsed = new URL(adminUrl());
  const adminHost = adminParsed.hostname;
  const adminPort = Number(adminParsed.port || 5432);
  const adminUser = decodeURIComponent(adminParsed.username);
  const adminPass = decodeURIComponent(adminParsed.password);

  const pool = new Pool({
    connectionString: adminUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });

  try {
    const roleExists = await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [
      username,
    ]);
    if (roleExists.rowCount === 0) {
      await pool.query(
        `CREATE ROLE ${quoteIdent(username)} LOGIN PASSWORD ${quoteLiteral(password)}`
      );
    } else {
      await pool.query(
        `ALTER ROLE ${quoteIdent(username)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`
      );
    }

    const dbExists = await pool.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [
      database,
    ]);
    if (dbExists.rowCount === 0) {
      await pool.query(
        `CREATE DATABASE ${quoteIdent(database)} OWNER ${quoteIdent(username)}`
      );
    } else {
      await pool.query(
        `ALTER DATABASE ${quoteIdent(database)} OWNER TO ${quoteIdent(username)}`
      );
    }

    const grantPool = new Pool({
      connectionString: buildConnString({
        user: adminUser,
        password: adminPass,
        host: adminHost,
        port: adminPort,
        database,
      }),
      max: 1,
      connectionTimeoutMillis: 10_000,
    });

    try {
      await grantPool.query(
        `GRANT ALL ON SCHEMA public TO ${quoteIdent(username)}`
      );
      await grantPool.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${quoteIdent(username)}`
      );
      await grantPool.query(
        `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${quoteIdent(username)}`
      );
      await grantPool.query(`
        CREATE TABLE IF NOT EXISTS _graphcore_meta (
          key TEXT PRIMARY KEY,
          value TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await grantPool.query(
        `INSERT INTO _graphcore_meta (key, value) VALUES ($1, $2), ($3, $4)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        ['plan', String(planId || 'starter'), 'instance_id', String(instanceId || '')]
      );
      await grantPool.query(
        `GRANT ALL ON TABLE _graphcore_meta TO ${quoteIdent(username)}`
      );

      // Project Auth schema + RLS helpers (gen_random_uuid needs pgcrypto)
      try {
        await grantPool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
      } catch (extErr) {
        console.warn('[provision] pgcrypto:', extErr.message);
      }
      try {
        const sql = fs.readFileSync(RLS_TEMPLATE_PATH, 'utf8');
        await grantPool.query(sql);
        await grantPool.query(
          `GRANT USAGE ON SCHEMA auth TO ${quoteIdent(username)}`
        );
        await grantPool.query(
          `GRANT ALL ON ALL TABLES IN SCHEMA auth TO ${quoteIdent(username)}`
        );
        await grantPool.query(
          `GRANT ALL ON ALL SEQUENCES IN SCHEMA auth TO ${quoteIdent(username)}`
        );
      } catch (rlsErr) {
        console.warn('[provision] RLS/auth template:', rlsErr.message);
      }

      // Realtime CDC: AFTER ROW triggers → pg_notify('graphcore_changes')
      try {
        const rtSql = fs.readFileSync(REALTIME_TEMPLATE_PATH, 'utf8');
        await grantPool.query(rtSql);
      } catch (rtErr) {
        console.warn('[provision] realtime notify template:', rtErr.message);
      }
    } finally {
      await grantPool.end().catch(() => {});
    }

    const connectionString = buildConnString({
      user: username,
      password,
      host,
      port,
      database,
    });
    const internalConnectionString = buildConnString({
      user: username,
      password,
      host: adminHost,
      port: adminPort,
      database,
    });
    const jwtSecret = crypto.randomBytes(32).toString('base64url');

    console.log(
      `[provision] created database=${database} role=${username} plan=${planId || 'n/a'}`
    );

    return {
      database,
      username,
      password,
      host,
      port,
      connectionString,
      internalConnectionString,
      jwtSecret,
      region: process.env.PROVISION_REGION || 'shared',
      status: 'ready',
    };
  } finally {
    await pool.end().catch(() => {});
  }
}

/** Fallback when admin Postgres is unreachable: shared demo DB. */
function demoPlaceholder() {
  const host = publicHost();
  const port = publicPort();
  return {
    database: 'graphcore_demo',
    username: 'graphcore',
    password: 'graphcore',
    host,
    port,
    connectionString: `postgresql://graphcore:graphcore@${host}:${port}/graphcore_demo`,
    internalConnectionString:
      process.env.TENANT_DATABASE_URL ||
      `postgresql://graphcore:graphcore@${internalHost()}:${internalPort()}/graphcore_demo`,
    jwtSecret: crypto.randomBytes(32).toString('base64url'),
    region: 'local',
    status: 'ready',
    placeholder: true,
  };
}

async function provisionOrFallback({ instanceId, planId, databaseName }) {
  try {
    return await provisionPostgresDatabase({ instanceId, planId, databaseName });
  } catch (err) {
    console.warn(
      '[provision] CREATE DATABASE failed — falling back to shared demo DB:',
      err.message
    );
    return demoPlaceholder();
  }
}

async function withAdminPool(fn) {
  const pool = new Pool({
    connectionString: adminUrl(),
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    return await fn(pool);
  } finally {
    await pool.end().catch(() => {});
  }
}

/**
 * Pause: revoke CONNECT on database (shared-server soft pause).
 * Does not DROP data.
 */
async function pauseInstance({ database, username }) {
  if (!database || database === 'graphcore_demo' || database === 'graphcore_meta') {
    return { status: 'paused', skippedDrop: true, note: 'shared demo DB — status only' };
  }
  await withAdminPool(async (pool) => {
    await pool.query(
      `REVOKE CONNECT ON DATABASE ${quoteIdent(database)} FROM PUBLIC`
    );
    if (username) {
      await pool.query(
        `REVOKE CONNECT ON DATABASE ${quoteIdent(database)} FROM ${quoteIdent(username)}`
      );
      try {
        await pool.query(`ALTER ROLE ${quoteIdent(username)} NOLOGIN`);
      } catch (err) {
        console.warn('[provision] pause NOLOGIN:', err.message);
      }
    }
    // Terminate open backends
    await pool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database]
    );
  });
  return { status: 'paused' };
}

async function resumeInstance({ database, username, password }) {
  if (!database || database === 'graphcore_demo' || database === 'graphcore_meta') {
    return { status: 'ready', skipped: true };
  }
  await withAdminPool(async (pool) => {
    if (username) {
      if (password) {
        await pool.query(
          `ALTER ROLE ${quoteIdent(username)} WITH LOGIN PASSWORD ${quoteLiteral(password)}`
        );
      } else {
        await pool.query(`ALTER ROLE ${quoteIdent(username)} WITH LOGIN`);
      }
      await pool.query(
        `GRANT CONNECT ON DATABASE ${quoteIdent(database)} TO ${quoteIdent(username)}`
      );
    }
  });
  return { status: 'ready' };
}

/**
 * Soft-delete metadata caller sets status=deleted; this DROP DATABASE + ROLE.
 */
async function deleteInstanceDatabase({ database, username }) {
  if (!database || database === 'graphcore_demo' || database === 'graphcore_meta') {
    return {
      status: 'deleted',
      dropped: false,
      note: 'refusing to DROP shared demo/meta database',
    };
  }
  await withAdminPool(async (pool) => {
    await pool.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database]
    );
    await pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)} WITH (FORCE)`).catch(
      async () => {
        await pool.query(`DROP DATABASE IF EXISTS ${quoteIdent(database)}`);
      }
    );
    if (username && username !== 'graphcore') {
      await pool.query(`DROP ROLE IF EXISTS ${quoteIdent(username)}`).catch((err) => {
        console.warn('[provision] DROP ROLE:', err.message);
      });
    }
  });
  return { status: 'deleted', dropped: true, database };
}

/** Update plan label in tenant _graphcore_meta (soft resize — no cgroup). */
async function resizeInstancePlan({ connectionString, planId }) {
  if (!connectionString) {
    return { status: 'resized', plan: planId, note: 'no connection — meta only' };
  }
  const pool = new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 8_000,
  });
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _graphcore_meta (
        key TEXT PRIMARY KEY,
        value TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await pool.query(
      `INSERT INTO _graphcore_meta (key, value) VALUES ('plan', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [String(planId)]
    );
    return { status: 'resized', plan: planId };
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = {
  provisionPostgresDatabase,
  provisionOrFallback,
  demoPlaceholder,
  buildConnString,
  pauseInstance,
  resumeInstance,
  deleteInstanceDatabase,
  resizeInstancePlan,
  quoteIdent,
  quoteLiteral,
  adminUrl,
};
