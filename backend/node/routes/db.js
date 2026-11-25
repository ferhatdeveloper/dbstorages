const express = require('express');
const { isTenantReady, resolveTenantPool, getMetaPool } = require('../lib/db');
const { authMiddleware } = require('../lib/auth');
const { notifyChange, ensureRealtimeTriggers } = require('../lib/realtime');
const { syncSchemaFromRetailEx } = require('../lib/openapiSchemaSync');

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

/** Batch introspect all public base tables — pgAdmin-style column metadata. */
async function introspectPublicTables(pool, { exactCounts = false } = {}) {
  const tablesRes = await pool.query(`
    SELECT
      c.relname AS name,
      COALESCE(c.reltuples, 0)::bigint AS est_rows,
      CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view' WHEN 'm' THEN 'view' ELSE 'other' END AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm')
      AND c.relname NOT LIKE 'pg_%'
    ORDER BY
      CASE WHEN c.relname LIKE '\\_graphcore%' ESCAPE '\\' THEN 1 ELSE 0 END,
      c.relname
  `);

  const colsRes = await pool.query(`
    SELECT
      c.table_name,
      c.column_name AS name,
      CASE
        WHEN c.data_type = 'USER-DEFINED' THEN c.udt_name
        WHEN c.data_type = 'ARRAY' THEN c.udt_name
        WHEN c.character_maximum_length IS NOT NULL
          THEN c.data_type || '(' || c.character_maximum_length || ')'
        WHEN c.data_type = 'numeric' AND c.numeric_precision IS NOT NULL
          THEN c.data_type || '(' || c.numeric_precision
            || COALESCE(',' || c.numeric_scale, '') || ')'
        ELSE c.data_type
      END AS type,
      c.udt_name,
      c.is_nullable = 'YES' AS nullable,
      c.column_default AS default_value,
      c.ordinal_position
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
    ORDER BY c.table_name, c.ordinal_position
  `);

  const pkRes = await pool.query(`
    SELECT kcu.table_name, kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'PRIMARY KEY'
  `);

  const fkRes = await pool.query(`
    SELECT
      kcu.table_name,
      kcu.column_name,
      ccu.table_name AS referenced_table,
      ccu.column_name AS referenced_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.table_schema = 'public'
      AND tc.constraint_type = 'FOREIGN KEY'
  `);

  const pkSet = new Set(pkRes.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const fkMap = new Map();
  for (const r of fkRes.rows) {
    fkMap.set(`${r.table_name}.${r.column_name}`, {
      referenced_table: r.referenced_table,
      referenced_column: r.referenced_column,
    });
  }

  const colsByTable = new Map();
  for (const r of colsRes.rows) {
    if (!colsByTable.has(r.table_name)) colsByTable.set(r.table_name, []);
    const key = `${r.table_name}.${r.name}`;
    const fk = fkMap.get(key);
    colsByTable.get(r.table_name).push({
      name: r.name,
      type: r.type,
      nullable: r.nullable,
      default_value: r.default_value,
      is_primary: pkSet.has(key),
      is_foreign_key: Boolean(fk),
      referenced_table: fk?.referenced_table,
      referenced_column: fk?.referenced_column,
    });
  }

  const now = new Date().toISOString();
  const tables = [];
  for (const row of tablesRes.rows) {
    let rowCount = Number(row.est_rows) || 0;
    if (exactCounts && row.kind === 'table') {
      try {
        const countRes = await pool.query(
          `SELECT COUNT(*)::int AS n FROM ${quoteIdent(row.name)}`
        );
        rowCount = countRes.rows[0].n;
      } catch {
        /* keep estimate */
      }
    }
    tables.push({
      name: row.name,
      kind: row.kind,
      schema: 'public',
      columns: colsByTable.get(row.name) || [],
      rowCount,
      locked: false,
      created_at: now,
      updated_at: now,
    });
  }
  return tables;
}

async function introspectTable(pool, tableName) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    throw Object.assign(new Error(`Invalid table: ${tableName}`), {
      status: 400,
      code: 'validation',
    });
  }
  const all = await introspectPublicTables(pool, { exactCounts: false });
  const found = all.find((t) => t.name === tableName);
  if (!found) {
    throw Object.assign(new Error(`table not found: ${tableName}`), {
      status: 404,
      code: 'not_found',
    });
  }
  try {
    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ${quoteIdent(tableName)}`
    );
    found.rowCount = countRes.rows[0].n;
  } catch {
    /* keep estimate */
  }
  return found;
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
    const exact = String(req.query.exactCounts || '') === '1';
    const tables = await introspectPublicTables(pool, { exactCounts: exact });
    // Table Editor expects base tables primarily
    res.json(ok(tables.filter((t) => t.kind === 'table')));
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
    const objects = await introspectPublicTables(pool, { exactCounts: false });
    const tables = objects.filter((t) => t.kind === 'table');
    const views = objects.filter((t) => t.kind === 'view');
    res.json(
      ok({
        schemas: [
          {
            name: 'public',
            tables,
            views,
          },
        ],
        tables, // backward-compatible flat list for SchemaPage
        views,
      })
    );
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'query_failed');
  }
});

/**
 * Import full table/column structures from RetailEX PostgREST OpenAPI
 * into the selected instance (DDL only — no row data).
 */
router.post('/schema/sync-retailex', async (req, res) => {
  if (!requireTenant(res)) return;
  try {
    const pool = await poolFor(req);
    const instanceId = instanceIdOf(req);
    let tenantCode =
      req.body?.tenantCode ||
      req.body?.code ||
      req.query.tenantCode ||
      null;

    if (!tenantCode && instanceId) {
      const meta = getMetaPool();
      if (meta) {
        const { rows } = await meta.query(
          `SELECT database FROM instances WHERE id = $1 LIMIT 1`,
          [instanceId]
        );
        tenantCode = rows[0]?.database || null;
      }
    }

    if (!tenantCode) {
      return fail(res, 400, 'tenantCode or instanceId required', 'validation');
    }

    const dryRun = Boolean(req.body?.dryRun);
    const result = await syncSchemaFromRetailEx(pool, tenantCode, { dryRun });
    await ensureRealtimeTriggers(pool).catch(() => {});
    res.json(ok(result));
  } catch (err) {
    fail(res, err.status || 500, err.message, err.code || 'sync_failed');
  }
});

module.exports = router;
