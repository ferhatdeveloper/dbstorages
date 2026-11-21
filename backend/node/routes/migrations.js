const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { resolveTenantPool } = require('../lib/db');
const { assertInstanceAccess } = require('../lib/rbac');
const migrations = require('../lib/migrations');

const router = express.Router();

async function poolFor(req, instanceId) {
  await assertInstanceAccess(req.user.sub, instanceId);
  return resolveTenantPool({
    instanceId,
    userId: req.user.sub,
    requireAuth: true,
  });
}

router.get('/:instanceId', authMiddleware, async (req, res) => {
  try {
    const pool = await poolFor(req, req.params.instanceId);
    const rows = await migrations.listMigrations(pool);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'migrations_list', message: err.message },
    });
  }
});

router.post('/:instanceId/apply', authMiddleware, async (req, res) => {
  try {
    const pool = await poolFor(req, req.params.instanceId);
    const body = req.body || {};
    if (Array.isArray(body.migrations)) {
      const results = await migrations.applyMany(pool, body.migrations);
      return res.status(201).json({ success: true, data: results });
    }
    const result = await migrations.applyMigration(pool, {
      id: body.id,
      name: body.name,
      sql: body.sql,
    });
    res.status(result.status === 'already_applied' ? 200 : 201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: err.code || 'migrations_apply', message: err.message },
    });
  }
});

module.exports = router;
