const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { assertInstanceAccess } = require('../lib/rbac');
const functions = require('../lib/functions');

const router = express.Router();

async function requireInstance(req, res) {
  try {
    return await assertInstanceAccess(req.user.sub, req.params.instanceId);
  } catch (err) {
    res.status(err.status || 403).json({
      success: false,
      error: { code: err.code || 'forbidden', message: err.message },
    });
    return null;
  }
}

router.get('/:instanceId', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    res.json({
      success: true,
      data: {
        runtime: 'node-vm',
        note: 'MVP Node worker — not Deno Deploy. No network/fs in sandbox.',
        functions: functions.list(row.id),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'functions_list', message: err.message },
    });
  }
});

router.get('/:instanceId/:name', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    res.json({ success: true, data: functions.get(row.id, req.params.name) });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: 'functions_get', message: err.message },
    });
  }
});

router.put('/:instanceId/:name', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const source = req.body?.source ?? req.body?.code;
    const meta = functions.deploy(row.id, req.params.name, source, {
      note: req.body?.note,
    });
    res.status(meta.created ? 201 : 200).json({ success: true, data: meta });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: 'functions_deploy', message: err.message },
    });
  }
});

router.delete('/:instanceId/:name', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    res.json({ success: true, data: functions.remove(row.id, req.params.name) });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: 'functions_delete', message: err.message },
    });
  }
});

router.post('/:instanceId/:name/invoke', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const out = await functions.invoke(row.id, req.params.name, {
      method: req.body?.method || 'POST',
      headers: req.body?.headers || {},
      body: req.body?.body !== undefined ? req.body.body : req.body,
      query: req.body?.query || req.query,
    });
    res.status(out.status || 200).json({
      success: true,
      data: out.body,
      headers: out.headers,
      runtime: 'node-vm',
    });
  } catch (err) {
    res.status(err.status || 500).json({
      success: false,
      error: { code: 'functions_invoke', message: err.message },
    });
  }
});

module.exports = router;
