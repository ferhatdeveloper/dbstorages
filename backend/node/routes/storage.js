const express = require('express');
const multer = require('multer');
const { authMiddleware } = require('../lib/auth');
const { assertInstanceAccess } = require('../lib/rbac');
const storage = require('../lib/storage');
const { storageQuotaBytes } = require('../payments');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: Number(process.env.STORAGE_MAX_BYTES || 25 * 1024 * 1024) },
});

async function requireInstance(req, res) {
  try {
    const instanceId = req.params.instanceId;
    const row = await assertInstanceAccess(req.user.sub, instanceId);
    return row;
  } catch (err) {
    res.status(err.status || 403).json({
      success: false,
      error: { code: err.code || 'forbidden', message: err.message },
    });
    return null;
  }
}

function publicBase(req) {
  return (
    process.env.PUBLIC_API_URL ||
    `${req.protocol}://${req.get('host')}`
  ).replace(/\/$/, '');
}

async function quotaForRow(row) {
  const limit = storageQuotaBytes(row.plan || 'starter');
  const usage = await storage.usageBytes(row.id);
  return {
    plan: row.plan || 'starter',
    usedBytes: usage.usedBytes,
    limitBytes: limit,
    remainingBytes: Math.max(0, limit - usage.usedBytes),
    backend: usage.backend,
    bucket: usage.bucket,
  };
}

router.get('/status', authMiddleware, (_req, res) => {
  res.json({ success: true, data: storage.status() });
});

/** Public signed download — no Bearer; JWT in query */
router.get('/signed/:token', async (req, res) => {
  try {
    const claims = storage.verifySignedDownload(req.params.token);
    const obj = await storage.getObject(claims.instanceId, claims.key);
    const filename = String(claims.key).split('/').pop() || 'download';
    res.setHeader('Content-Type', obj.contentType);
    if (obj.size != null) res.setHeader('Content-Length', String(obj.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`
    );
    if (obj.body && typeof obj.body.pipe === 'function') {
      obj.body.pipe(res);
    } else {
      res.send(obj.body);
    }
  } catch (err) {
    const status = err.name === 'TokenExpiredError' ? 410 : err.status || 400;
    res.status(status).json({
      success: false,
      error: { code: 'signed_url', message: err.message },
    });
  }
});

router.get('/:instanceId/quota', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const q = await quotaForRow(row);
    res.json({ success: true, data: q });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'storage_quota', message: err.message },
    });
  }
});

router.get('/:instanceId/objects', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const prefix = req.query.prefix || req.query.path || '';
    const result = await storage.listObjects(row.id, String(prefix));
    const quota = await quotaForRow(row);
    const files = result.objects.map((o) => ({
      id: o.key,
      name: o.name,
      type: o.type,
      size: o.size,
      modified: o.modified,
      owner: req.user.email || req.user.sub,
      permissions: 'rw',
      isPublic: false,
      isStarred: false,
      path: `/${o.key.replace(/\/$/, '')}`,
      key: o.key,
      etag: o.etag,
    }));
    res.json({
      success: true,
      data: {
        bucket: result.bucket,
        backend: result.backend,
        prefix: String(prefix || ''),
        files,
        quota,
      },
    });
  } catch (err) {
    console.error('[storage] list', err.message);
    res.status(500).json({
      success: false,
      error: { code: 'storage_list', message: err.message },
    });
  }
});

router.post(
  '/:instanceId/upload',
  authMiddleware,
  upload.single('file'),
  async (req, res) => {
    const row = await requireInstance(req, res);
    if (!row) return;
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'validation', message: 'file required (multipart field: file)' },
        });
      }
      const quota = await quotaForRow(row);
      if (quota.usedBytes + req.file.size > quota.limitBytes) {
        return res.status(413).json({
          success: false,
          error: {
            code: 'quota_exceeded',
            message: `Storage quota exceeded (${quota.usedBytes}/${quota.limitBytes} bytes). Upgrade plan.`,
            quota,
          },
        });
      }
      const prefix = String(req.body.prefix || req.body.path || '')
        .replace(/^\/+/, '')
        .replace(/\/$/, '');
      const key = prefix ? `${prefix}/${req.file.originalname}` : req.file.originalname;
      const put = await storage.putObject(
        row.id,
        key,
        req.file.buffer,
        req.file.mimetype
      );
      res.json({
        success: true,
        data: {
          ...put,
          id: put.key,
          name: req.file.originalname,
          type: 'file',
          modified: new Date().toISOString(),
          path: `/${put.key}`,
          quota: await quotaForRow(row),
        },
      });
    } catch (err) {
      console.error('[storage] upload', err.message);
      res.status(500).json({
        success: false,
        error: { code: 'storage_upload', message: err.message },
      });
    }
  }
);

router.post('/:instanceId/folders', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'name required' },
      });
    }
    const prefix = String(req.body.prefix || req.body.path || '')
      .replace(/^\/+/, '')
      .replace(/\/$/, '');
    const folderPath = prefix ? `${prefix}/${name}` : name;
    const put = await storage.createFolder(row.id, folderPath);
    res.json({
      success: true,
      data: {
        ...put,
        id: put.key,
        name,
        type: 'folder',
        size: 0,
        modified: new Date().toISOString(),
        path: `/${folderPath}`,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'storage_folder', message: err.message },
    });
  }
});

router.post('/:instanceId/sign', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const key = req.body?.key || req.query.key;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'key required' },
      });
    }
    const expiresIn = Math.min(
      86400,
      Math.max(60, Number(req.body?.expiresIn || 900))
    );
    const signed = storage.createSignedDownload({
      instanceId: row.id,
      key: String(key),
      expiresIn,
      secret: row.jwt_secret || undefined,
    });
    // Prefer platform secret for public route verify when instance secret used inconsistently
    const signedPlatform = storage.createSignedDownload({
      instanceId: row.id,
      key: String(key),
      expiresIn,
    });
    const url = `${publicBase(req)}/api/storage/signed/${signedPlatform.token}`;
    res.json({
      success: true,
      data: {
        url,
        key: signed.key,
        expiresIn,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'storage_sign', message: err.message },
    });
  }
});

router.get('/:instanceId/download', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const key = req.query.key;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'key query required' },
      });
    }
    const obj = await storage.getObject(row.id, String(key));
    const filename = String(key).split('/').pop() || 'download';
    res.setHeader('Content-Type', obj.contentType);
    if (obj.size != null) res.setHeader('Content-Length', String(obj.size));
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`
    );
    if (obj.body && typeof obj.body.pipe === 'function') {
      obj.body.pipe(res);
    } else {
      res.send(obj.body);
    }
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: { code: 'storage_download', message: err.message },
    });
  }
});

router.delete('/:instanceId/objects', authMiddleware, async (req, res) => {
  const row = await requireInstance(req, res);
  if (!row) return;
  try {
    const key = req.query.key || req.body?.key;
    if (!key) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'key required' },
      });
    }
    const result = await storage.deleteObject(row.id, String(key));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'storage_delete', message: err.message },
    });
  }
});

module.exports = router;
