const express = require('express');
const { isTenantReady, resolveTenantPool } = require('../lib/db');
const { authMiddleware } = require('../lib/auth');
const { notifyChange, ensureRealtimeTriggers } = require('../lib/realtime');

const router = express.Router();

function ok(data) {
  return { success: true, data };
}

function fail(res, status, message, code = 'error') {
  return res.status(status).json({
    success: false,
    error: typeof message === 'string' ? message : message,
    errorObj: { code, message },
  });
}

function requireTenant(res) {
  if (!isTenantReady()) {
    // Still allow resolveTenantPool to hit provisioned instances even if demo tenant is down
    return true;
  }
  return true;
}

async function poolFor(req) {
  const instanceId =
    req.query.instanceId ||
    req.headers['x-graphcore-instance'] ||
    req.body?.instanceId ||
    null;
  return resolveTenantPool({
    instanceId: instanceId || null,
    userId: req.user?.sub || null,
    requireAuth: true,
  });
}

function instanceIdOf(req) {
  return (
    req.query.instanceId ||
    req.headers['x-graphcore-instance'] ||
    req.body?.instanceId ||
    null
  );
}

function quoteIdent(name) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

async function introspectTable(pool, tableName) {
  const cols = await pool.query(
    `
    SELECT
      c.column_name AS name,
      c.data_type AS type,
      c.is_nullable = 'YES' AS nullable,
      c.column_default AS default_value,
      EXISTS (
        SELECT 1 FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        WHERE tc.table_schema = 'public'
          AND tc.table_name = c.table_name
          AND kcu.column_name = c.column_name
          AND tc.constraint_type = 'PRIMARY KEY'
      ) AS is_primary
    FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = $1
    ORDER BY c.ordinal_position
    `,
    [tableName]
  );

  const countRes = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${quoteIdent(tableName)}`
  );

  return {
    name: tableName,
    columns: cols.rows.map((r) => ({
      name: r.name,
      type: r.type,
      nullable: r.nullable,
      default_value: r.default_value,
      is_primary: r.is_primary,
      is_foreign_key: false,
    })),
    rowCount: countRes.rows[0].n,
    locked: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

router.use(authMiddleware);

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    data: { tenantReady: isTenantReady() },
  });
});

router.get('/tables', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const { rows } = await pool.query(`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const tables = [];
    for (const row of rows) {
      tables.push(await introspectTable(pool, row.name));
    }
    res.json(ok(tables));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'query_failed');
  }
});

router.get('/tables/:table', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const table = req.params.table;
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize = Math.min(
      200,
      Math.max(1, parseInt(req.query.pageSize || '50', 10))
    );
    const sortBy = req.query.sortBy;
    const sortOrder =
      String(req.query.sortOrder || 'asc').toLowerCase() === 'desc'
        ? 'DESC'
        : 'ASC';
    const search = req.query.search || req.query.q;

    const meta = await introspectTable(pool, table);
    const offset = (page - 1) * pageSize;

    let where = '';
    const params = [];
    if (search) {
      const parts = meta.columns.map((c, i) => {
        params.push(`%${search}%`);
        return `${quoteIdent(c.name)}::text ILIKE $${i + 1}`;
      });
      where = parts.length ? `WHERE (${parts.join(' OR ')})` : '';
    }

    let order = '';
    if (sortBy && meta.columns.some((c) => c.name === sortBy)) {
      order = `ORDER BY ${quoteIdent(sortBy)} ${sortOrder}`;
    }

    params.push(pageSize, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const dataRes = await pool.query(
      `SELECT * FROM ${quoteIdent(table)} ${where} ${order} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json(
      ok({
        columns: meta.columns,
        rows: dataRes.rows,
        total: meta.rowCount,
        page,
        pageSize,
      })
    );
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'query_failed');
  }
});

router.post('/tables/:table/rows', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const table = req.params.table;
    const data = req.body?.data || req.body || {};
    const keys = Object.keys(data);
    if (!keys.length) {
      return fail(res, 400, 'data required', 'validation');
    }
    const cols = keys.map(quoteIdent).join(', ');
    const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
    const values = keys.map((k) => data[k]);
    const { rows } = await pool.query(
      `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    // Row CDC: trigger → NOTIFY (see realtime_notify_template.sql)
    res.status(201).json(ok(rows[0]));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'insert_failed');
  }
});

router.put('/tables/:table/rows/:id', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const table = req.params.table;
    const id = req.params.id;
    const data = req.body?.data || req.body || {};
    const keys = Object.keys(data).filter((k) => k !== 'id');
    if (!keys.length) {
      return fail(res, 400, 'data required', 'validation');
    }
    const sets = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(', ');
    const values = keys.map((k) => data[k]);
    values.push(id);
    const { rows } = await pool.query(
      `UPDATE ${quoteIdent(table)} SET ${sets} WHERE id = $${values.length} RETURNING *`,
      values
    );
    if (!rows[0]) return fail(res, 404, 'row not found', 'not_found');
    res.json(ok(rows[0]));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'update_failed');
  }
});

router.delete('/tables/:table/rows/:id', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const table = req.params.table;
    const id = req.params.id;
    const { rowCount } = await pool.query(
      `DELETE FROM ${quoteIdent(table)} WHERE id = $1`,
      [id]
    );
    if (!rowCount) return fail(res, 404, 'row not found', 'not_found');
    res.json(ok({ deleted: true }));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'delete_failed');
  }
});

router.post('/tables/:table/rows/delete', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const table = req.params.table;
    const ids = req.body?.ids || [];
    if (!Array.isArray(ids) || !ids.length) {
      return fail(res, 400, 'ids required', 'validation');
    }
    const { rowCount } = await pool.query(
      `DELETE FROM ${quoteIdent(table)} WHERE id = ANY($1::int[])`,
      [ids.map(Number)]
    );
    res.json(ok({ deleted: rowCount }));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'delete_failed');
  }
});

router.post('/sql/execute', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const query = (req.body?.query || req.body?.sql || '').trim();
    if (!query) {
      return fail(res, 400, 'query required', 'validation');
    }

    const start = Date.now();
    const result = await pool.query(query);
    const duration = Date.now() - start;

    const rows = result.rows || [];
    const columns =
      rows.length > 0
        ? Object.keys(rows[0])
        : (result.fields || []).map((f) => f.name);

    const cmd = String(result.command || '').toUpperCase();
    // DML CDC via triggers. Refresh triggers after DDL CREATE TABLE.
    if (cmd === 'CREATE' || /create\s+table/i.test(query)) {
      await ensureRealtimeTriggers(pool).catch(() => {});
      await notifyChange(pool, instanceIdOf(req), {
        type: 'create',
        details: `SQL ${cmd || 'DDL'}`,
        user: req.user?.email,
      });
    }

    res.json(
      ok({
        rows,
        columns,
        rowCount: result.rowCount,
        command: result.command,
        duration,
      })
    );
  } catch (err) {
    if (err.status) {
      return fail(res, err.status, err.message, err.code || 'error');
    }
    res.status(400).json({
      success: false,
      error: err.message,
    });
  }
});

router.get('/schema', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const tablesRes = await pool.query(`
      SELECT table_name AS name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    const schemas = [];
    for (const t of tablesRes.rows) {
      schemas.push(await introspectTable(pool, t.name));
    }
    res.json(ok({ tables: schemas }));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'query_failed');
  }
});

module.exports = router;
