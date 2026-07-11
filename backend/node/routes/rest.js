/**
 * PostgREST-compatible data API gateway.
 * GET/POST/PATCH/DELETE /api/rest/:instanceId/:table
 * Uses the caller's instance pool only (auth + membership required).
 */

const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { resolveTenantPool, internalConnFromInstanceRow } = require('../lib/db');
const { assertInstanceAccess } = require('../lib/rbac');
const { quoteIdent, buildFromQuery } = require('../lib/restQuery');
const { notifyChange, startListenerForInstanceRow } = require('../lib/realtime');

const router = express.Router();

router.use(authMiddleware);

async function poolForInstance(req, instanceId) {
  const row = await assertInstanceAccess(req.user.sub, instanceId);
  const pool = await resolveTenantPool({
    instanceId,
    userId: req.user.sub,
    requireAuth: true,
  });
  startListenerForInstanceRow(row).catch(() => {});
  return { pool, row };
}

function preferReturn(req) {
  const prefer = String(req.headers.prefer || '').toLowerCase();
  return prefer.includes('return=representation');
}

router.get('/:instanceId/:table', async (req, res) => {
  try {
    const { instanceId, table } = req.params;
    const { pool } = await poolForInstance(req, instanceId);
    const q = buildFromQuery(req.query);
    const sql = `SELECT ${q.selectSql} FROM ${quoteIdent(table)} ${q.whereSql} ${q.orderSql} LIMIT $${q.params.length + 1} OFFSET $${q.params.length + 2}`;
    const { rows } = await pool.query(sql, [...q.params, q.limit, q.offset]);
    res.setHeader('Content-Range', `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
    res.json(rows);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'rest_error', message: err.message },
    });
  }
});

router.post('/:instanceId/:table', async (req, res) => {
  try {
    const { instanceId, table } = req.params;
    const { pool } = await poolForInstance(req, instanceId);
    const body = req.body;
    const rowsIn = Array.isArray(body) ? body : [body];
    if (!rowsIn.length || typeof rowsIn[0] !== 'object') {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'JSON object or array required' },
      });
    }

    const inserted = [];
    for (const data of rowsIn) {
      const keys = Object.keys(data || {});
      if (!keys.length) continue;
      const cols = keys.map(quoteIdent).join(', ');
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const values = keys.map((k) => data[k]);
      const { rows } = await pool.query(
        `INSERT INTO ${quoteIdent(table)} (${cols}) VALUES (${placeholders}) RETURNING *`,
        values
      );
      if (rows[0]) inserted.push(rows[0]);
    }

    await notifyChange(pool, instanceId, {
      type: 'insert',
      table,
      details: `REST insert into ${table}`,
      data: { count: inserted.length },
      user: req.user.email,
    });

    if (preferReturn(req) || inserted.length) {
      return res.status(201).json(Array.isArray(body) ? inserted : inserted[0] || null);
    }
    res.status(201).send();
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'rest_error', message: err.message },
    });
  }
});

router.patch('/:instanceId/:table', async (req, res) => {
  try {
    const { instanceId, table } = req.params;
    const { pool } = await poolForInstance(req, instanceId);
    const data = req.body || {};
    const keys = Object.keys(data).filter((k) => k !== 'id');
    if (!keys.length) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'update body required' },
      });
    }
    const q = buildFromQuery(req.query);
    if (!q.whereSql) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'At least one filter required for PATCH' },
      });
    }
    const sets = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(', ');
    const values = keys.map((k) => data[k]);
    const whereParams = q.params.map((_, i) => `$${keys.length + i + 1}`);
    // Remap where placeholders
    let whereSql = q.whereSql;
    q.params.forEach((_, i) => {
      whereSql = whereSql.replace(`$${i + 1}`, whereParams[i]);
    });
    const { rows } = await pool.query(
      `UPDATE ${quoteIdent(table)} SET ${sets} ${whereSql} RETURNING *`,
      [...values, ...q.params]
    );

    await notifyChange(pool, instanceId, {
      type: 'update',
      table,
      details: `REST update on ${table}`,
      data: { count: rows.length },
      user: req.user.email,
    });

    res.json(preferReturn(req) ? rows : rows);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'rest_error', message: err.message },
    });
  }
});

router.delete('/:instanceId/:table', async (req, res) => {
  try {
    const { instanceId, table } = req.params;
    const { pool } = await poolForInstance(req, instanceId);
    const q = buildFromQuery(req.query);
    if (!q.whereSql) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'At least one filter required for DELETE' },
      });
    }
    const { rows } = await pool.query(
      `DELETE FROM ${quoteIdent(table)} ${q.whereSql} RETURNING *`,
      q.params
    );

    await notifyChange(pool, instanceId, {
      type: 'delete',
      table,
      details: `REST delete on ${table}`,
      data: { count: rows.length },
      user: req.user.email,
    });

    res.json(rows);
  } catch (err) {
    res.status(err.status || 400).json({
      success: false,
      error: { code: err.code || 'rest_error', message: err.message },
    });
  }
});

/** Helper: public rest URL for an instance (documentation / UI). */
function buildRestUrl(instanceId, req) {
  const base =
    process.env.PUBLIC_API_URL ||
    `${req.protocol}://${req.get('host')}`;
  return `${base.replace(/\/$/, '')}/api/rest/${instanceId}`;
}

module.exports = { router, buildRestUrl };
