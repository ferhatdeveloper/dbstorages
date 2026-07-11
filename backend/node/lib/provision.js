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
async function provisionPostgresDatabase({ instanceId, planId }) {
  const database = makeDbName(instanceId);
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
        ['plan', String(planId || 'free'), 'instance_id', String(instanceId || '')]
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

async function provisionOrFallback({ instanceId, planId }) {
  try {
    return await provisionPostgresDatabase({ instanceId, planId });
  } catch (err) {
    console.warn(
      '[provision] CREATE DATABASE failed — falling back to shared demo DB:',
      err.message
    );
    return demoPlaceholder();
  }
}

module.exports = {
  provisionPostgresDatabase,
  provisionOrFallback,
  demoPlaceholder,
  buildConnString,
};
