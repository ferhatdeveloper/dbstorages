const express = require('express');
const { suggest, getCatalog } = require('../lib/domains');

const router = express.Router();

router.get('/pricing', (_req, res) => {
  res.json({
    success: true,
    data: getCatalog(),
    note: 'Mock katalog — gerçek registrar anahtarı sonraki tur',
  });
});

router.get('/suggest', async (req, res) => {
  try {
    const q = String(req.query.q || req.query.query || '').trim();
    if (!q) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'q required' },
      });
    }
    const data = await suggest(q);
    if (data.error && !data.results?.length) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: data.error },
        data,
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

module.exports = { router };
