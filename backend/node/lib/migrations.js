/**
 * Tenant SQL migration motor MVP.
 * Tracks applied migrations in public._graphcore_migrations.
 */

const crypto = require('crypto');

const MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS public._graphcore_migrations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

function checksum(sql) {
  return crypto.createHash('sha256').update(String(sql)).digest('hex').slice(0, 16);
}

async function ensureTable(pool) {
  await pool.query(MIGRATIONS_DDL);
}

async function listMigrations(pool) {
  await ensureTable(pool);
  const { rows } = await pool.query(
    `SELECT id, name, checksum, applied_at FROM public._graphcore_migrations ORDER BY applied_at`
  );
  return rows;
}

/**
 * Apply a single migration SQL script.
 * @param {{ id?: string, name: string, sql: string }} mig
 */
async function applyMigration(pool, mig) {
  const name = String(mig.name || '').trim();
  const sql = String(mig.sql || '').trim();
  if (!name || !sql) {
    throw Object.assign(new Error('name and sql required'), { status: 400 });
  }
  if (sql.length > 500_000) {
    throw Object.assign(new Error('migration too large'), { status: 413 });
  }
  await ensureTable(pool);
  const id = mig.id || `mig_${checksum(name + sql).slice(0, 12)}`;
  const sum = checksum(sql);

  const existing = await pool.query(
    `SELECT id, checksum FROM public._graphcore_migrations WHERE id = $1 OR name = $2 LIMIT 1`,
    [id, name]
  );
  if (existing.rowCount > 0) {
    const row = existing.rows[0];
    if (row.checksum === sum) {
      return { id: row.id, name, status: 'already_applied', checksum: sum };
    }
    throw Object.assign(
      new Error(`migration "${name}" already applied with different checksum`),
      { status: 409, code: 'migration_conflict' }
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      `INSERT INTO public._graphcore_migrations (id, name, checksum) VALUES ($1,$2,$3)`,
      [id, name, sum]
    );
    await client.query('COMMIT');
    return { id, name, status: 'applied', checksum: sum };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Apply multiple migrations in order; stops on first failure.
 */
async function applyMany(pool, migrations = []) {
  const results = [];
  for (const mig of migrations) {
    const r = await applyMigration(pool, mig);
    results.push(r);
  }
  return results;
}

module.exports = {
  ensureTable,
  listMigrations,
  applyMigration,
  applyMany,
  checksum,
};
