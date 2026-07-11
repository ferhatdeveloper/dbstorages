/**
 * S3-compatible object storage (MinIO) with local-disk fallback.
 * Objects are scoped under bucket `gc-{instanceId}` (sanitized).
 * MVP: signed download URLs (JWT) + usage/quota helpers.
 */

const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const jwt = require('jsonwebtoken');

const SIGNING_SECRET =
  process.env.STORAGE_SIGNING_SECRET ||
  process.env.JWT_SECRET ||
  'graphcore-dev-secret-change-me';

const LOCAL_ROOT =
  process.env.STORAGE_LOCAL_PATH ||
  path.join(__dirname, '..', '.storage');

function isS3Configured() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY &&
      process.env.S3_SECRET_KEY
  );
}

function bucketName(instanceId) {
  const id = String(instanceId || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 40);
  return `gc-${id || 'default'}`;
}

function sanitizeKey(key) {
  return String(key || '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '')
    .replace(/\\/g, '/');
}

let s3Client = null;

function getS3() {
  if (!isS3Configured()) return null;
  if (s3Client) return s3Client;
  try {
    const {
      S3Client,
      ListObjectsV2Command,
      PutObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
      CreateBucketCommand,
      HeadBucketCommand,
    } = require('@aws-sdk/client-s3');

    s3Client = {
      client: new S3Client({
        endpoint: process.env.S3_ENDPOINT,
        region: process.env.S3_REGION || 'us-east-1',
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== '0',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY,
          secretAccessKey: process.env.S3_SECRET_KEY,
        },
      }),
      ListObjectsV2Command,
      PutObjectCommand,
      GetObjectCommand,
      DeleteObjectCommand,
      CreateBucketCommand,
      HeadBucketCommand,
    };
    return s3Client;
  } catch (err) {
    console.warn('[storage] @aws-sdk/client-s3 missing:', err.message);
    return null;
  }
}

function localDir(instanceId) {
  const dir = path.join(LOCAL_ROOT, bucketName(instanceId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function ensureBucket(instanceId) {
  const s3 = getS3();
  const bucket = bucketName(instanceId);
  if (!s3) {
    localDir(instanceId);
    return { bucket, backend: 'local' };
  }
  try {
    await s3.client.send(new s3.HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await s3.client.send(new s3.CreateBucketCommand({ Bucket: bucket }));
    } catch (err) {
      if (!/BucketAlreadyOwnedByYou|BucketAlreadyExists/i.test(err.message || '')) {
        throw err;
      }
    }
  }
  return { bucket, backend: 's3' };
}

async function listObjects(instanceId, prefix = '') {
  const cleanPrefix = sanitizeKey(prefix);
  const { bucket, backend } = await ensureBucket(instanceId);

  if (backend === 'local') {
    const root = localDir(instanceId);
    const target = cleanPrefix ? path.join(root, cleanPrefix) : root;
    if (!fs.existsSync(target)) return { bucket, backend, objects: [] };

    const entries = fs.readdirSync(target, { withFileTypes: true });
    const objects = entries.map((ent) => {
      const rel = cleanPrefix ? `${cleanPrefix}/${ent.name}` : ent.name;
      const full = path.join(root, rel);
      const stat = fs.statSync(full);
      return {
        key: ent.isDirectory() ? `${rel.replace(/\/$/, '')}/` : rel,
        name: ent.name,
        type: ent.isDirectory() ? 'folder' : 'file',
        size: ent.isDirectory() ? 0 : stat.size,
        modified: stat.mtime.toISOString(),
        etag: null,
      };
    });
    return { bucket, backend, objects };
  }

  const s3 = getS3();
  const res = await s3.client.send(
    new s3.ListObjectsV2Command({
      Bucket: bucket,
      Prefix: cleanPrefix ? `${cleanPrefix.replace(/\/$/, '')}/` : '',
      Delimiter: '/',
    })
  );

  const objects = [];
  for (const p of res.CommonPrefixes || []) {
    const key = p.Prefix;
    const name = key.replace(cleanPrefix ? `${cleanPrefix}/` : '', '').replace(/\/$/, '');
    if (!name) continue;
    objects.push({
      key,
      name,
      type: 'folder',
      size: 0,
      modified: new Date().toISOString(),
      etag: null,
    });
  }
  for (const obj of res.Contents || []) {
    if (obj.Key === cleanPrefix || obj.Key.endsWith('/')) continue;
    const name = obj.Key.split('/').pop();
    objects.push({
      key: obj.Key,
      name,
      type: 'file',
      size: obj.Size || 0,
      modified: (obj.LastModified || new Date()).toISOString(),
      etag: obj.ETag || null,
    });
  }
  return { bucket, backend, objects };
}

async function putObject(instanceId, key, body, contentType) {
  const cleanKey = sanitizeKey(key);
  if (!cleanKey) throw new Error('object key required');
  const { bucket, backend } = await ensureBucket(instanceId);

  if (backend === 'local') {
    const full = path.join(localDir(instanceId), cleanKey);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (Buffer.isBuffer(body)) {
      fs.writeFileSync(full, body);
    } else if (typeof body === 'string') {
      fs.writeFileSync(full, body);
    } else {
      fs.writeFileSync(full, Buffer.from([]));
    }
    const stat = fs.statSync(full);
    return {
      bucket,
      backend,
      key: cleanKey,
      size: stat.size,
      contentType: contentType || 'application/octet-stream',
    };
  }

  const s3 = getS3();
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body || []);
  await s3.client.send(
    new s3.PutObjectCommand({
      Bucket: bucket,
      Key: cleanKey,
      Body: buf,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  return {
    bucket,
    backend,
    key: cleanKey,
    size: buf.length,
    contentType: contentType || 'application/octet-stream',
  };
}

async function createFolder(instanceId, folderPath) {
  const key = sanitizeKey(folderPath).replace(/\/?$/, '/');
  return putObject(instanceId, key, Buffer.alloc(0), 'application/x-directory');
}

async function getObject(instanceId, key) {
  const cleanKey = sanitizeKey(key);
  const { bucket, backend } = await ensureBucket(instanceId);

  if (backend === 'local') {
    const full = path.join(localDir(instanceId), cleanKey);
    if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      const err = new Error('Object not found');
      err.status = 404;
      throw err;
    }
    const buf = fs.readFileSync(full);
    return {
      bucket,
      backend,
      key: cleanKey,
      body: Readable.from(buf),
      contentType: 'application/octet-stream',
      size: buf.length,
    };
  }

  const s3 = getS3();
  const res = await s3.client.send(
    new s3.GetObjectCommand({ Bucket: bucket, Key: cleanKey })
  );
  return {
    bucket,
    backend,
    key: cleanKey,
    body: res.Body,
    contentType: res.ContentType || 'application/octet-stream',
    size: res.ContentLength || null,
  };
}

async function deleteObject(instanceId, key) {
  const cleanKey = sanitizeKey(key);
  const { bucket, backend } = await ensureBucket(instanceId);

  if (backend === 'local') {
    const full = path.join(localDir(instanceId), cleanKey);
    if (fs.existsSync(full)) {
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        fs.rmSync(full, { recursive: true, force: true });
      } else {
        fs.unlinkSync(full);
      }
    }
    return { bucket, backend, key: cleanKey, deleted: true };
  }

  const s3 = getS3();
  await s3.client.send(
    new s3.DeleteObjectCommand({ Bucket: bucket, Key: cleanKey })
  );
  return { bucket, backend, key: cleanKey, deleted: true };
}

function status() {
  const s3 = isS3Configured();
  return {
    configured: true,
    backend: s3 ? 's3' : 'local',
    endpoint: s3 ? process.env.S3_ENDPOINT : LOCAL_ROOT,
    bucketPrefix: 'gc-',
    signedUrls: true,
  };
}

/** Recursively sum object bytes (local or S3 list-all). */
async function usageBytes(instanceId) {
  const { bucket, backend } = await ensureBucket(instanceId);
  if (backend === 'local') {
    const root = localDir(instanceId);
    let total = 0;
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      }
    }
    walk(root);
    return { bucket, backend, usedBytes: total };
  }

  const s3 = getS3();
  let total = 0;
  let token;
  do {
    const res = await s3.client.send(
      new s3.ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: token,
      })
    );
    for (const obj of res.Contents || []) {
      total += obj.Size || 0;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return { bucket, backend, usedBytes: total };
}

/**
 * Create a short-lived signed download token (not a full S3 presign —
 * GraphCore verifies JWT then streams the object).
 */
function createSignedDownload({ instanceId, key, expiresIn = 900, secret }) {
  const cleanKey = sanitizeKey(key);
  const tok = jwt.sign(
    {
      typ: 'storage_download',
      instanceId,
      key: cleanKey,
    },
    secret || SIGNING_SECRET,
    { expiresIn }
  );
  return {
    token: tok,
    key: cleanKey,
    expiresIn: typeof expiresIn === 'number' ? expiresIn : 900,
  };
}

function verifySignedDownload(token, secret) {
  const payload = jwt.verify(token, secret || SIGNING_SECRET);
  if (payload.typ !== 'storage_download' || !payload.instanceId || !payload.key) {
    throw Object.assign(new Error('Invalid signed URL token'), { status: 400 });
  }
  return {
    instanceId: payload.instanceId,
    key: sanitizeKey(payload.key),
  };
}

module.exports = {
  isS3Configured,
  bucketName,
  sanitizeKey,
  ensureBucket,
  listObjects,
  putObject,
  createFolder,
  getObject,
  deleteObject,
  usageBytes,
  createSignedDownload,
  verifySignedDownload,
  status,
};
