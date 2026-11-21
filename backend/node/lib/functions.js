/**
 * Edge Functions MVP — Node worker (not Deno).
 * Source stored under FUNCTIONS_ROOT / .functions/{instanceId}/{name}.js
 * Invoke runs in vm with timeout; no network/fs by default.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT =
  process.env.FUNCTIONS_ROOT ||
  path.join(__dirname, '..', '.functions');

function sanitizeName(name) {
  const n = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
  if (!n) throw Object.assign(new Error('invalid function name'), { status: 400 });
  return n;
}

function instanceDir(instanceId) {
  const id = String(instanceId || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
  const dir = path.join(ROOT, id || 'default');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function fnPath(instanceId, name) {
  return path.join(instanceDir(instanceId), `${sanitizeName(name)}.js`);
}

function metaPath(instanceId, name) {
  return path.join(instanceDir(instanceId), `${sanitizeName(name)}.meta.json`);
}

function list(instanceId) {
  const dir = instanceDir(instanceId);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
  return files.map((f) => {
    const name = f.replace(/\.js$/, '');
    const full = path.join(dir, f);
    const stat = fs.statSync(full);
    let meta = {};
    const mp = metaPath(instanceId, name);
    if (fs.existsSync(mp)) {
      try {
        meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
      } catch {
        /* ignore */
      }
    }
    return {
      name,
      size: stat.size,
      updatedAt: (meta.updatedAt || stat.mtime.toISOString()),
      createdAt: meta.createdAt || stat.birthtime.toISOString(),
      runtime: 'node-vm',
    };
  });
}

function deploy(instanceId, name, source, opts = {}) {
  const clean = sanitizeName(name);
  if (typeof source !== 'string' || !source.trim()) {
    throw Object.assign(new Error('source required'), { status: 400 });
  }
  if (source.length > 200_000) {
    throw Object.assign(new Error('source too large (max 200KB)'), { status: 413 });
  }
  const full = fnPath(instanceId, clean);
  const existed = fs.existsSync(full);
  let createdAt = new Date().toISOString();
  const mp = metaPath(instanceId, clean);
  if (existed && fs.existsSync(mp)) {
    try {
      createdAt = JSON.parse(fs.readFileSync(mp, 'utf8')).createdAt || createdAt;
    } catch {
      /* ignore */
    }
  }
  fs.writeFileSync(full, source, 'utf8');
  const meta = {
    name: clean,
    createdAt,
    updatedAt: new Date().toISOString(),
    runtime: 'node-vm',
    note: opts.note || null,
  };
  fs.writeFileSync(mp, JSON.stringify(meta, null, 2));
  return { ...meta, created: !existed };
}

function get(instanceId, name) {
  const clean = sanitizeName(name);
  const full = fnPath(instanceId, clean);
  if (!fs.existsSync(full)) {
    throw Object.assign(new Error('function not found'), { status: 404 });
  }
  const source = fs.readFileSync(full, 'utf8');
  let meta = {};
  const mp = metaPath(instanceId, clean);
  if (fs.existsSync(mp)) {
    try {
      meta = JSON.parse(fs.readFileSync(mp, 'utf8'));
    } catch {
      /* ignore */
    }
  }
  return { name: clean, source, ...meta, runtime: 'node-vm' };
}

function remove(instanceId, name) {
  const clean = sanitizeName(name);
  const full = fnPath(instanceId, clean);
  const mp = metaPath(instanceId, clean);
  if (fs.existsSync(full)) fs.unlinkSync(full);
  if (fs.existsSync(mp)) fs.unlinkSync(mp);
  return { name: clean, deleted: true };
}

/**
 * Expect source to export via:
 *   module.exports = async (req) => ({ status: 200, body: {...} })
 * or define `handler`.
 */
async function invoke(instanceId, name, { method, headers, body, query } = {}) {
  const fn = get(instanceId, name);
  const timeoutMs = Math.min(
    10_000,
    Math.max(100, Number(process.env.FUNCTIONS_TIMEOUT_MS || 3000))
  );

  const sandbox = {
    module: { exports: {} },
    exports: {},
    console: {
      log: (...a) => console.log(`[fn:${name}]`, ...a),
      warn: (...a) => console.warn(`[fn:${name}]`, ...a),
      error: (...a) => console.error(`[fn:${name}]`, ...a),
    },
    setTimeout,
    clearTimeout,
    Buffer,
    JSON,
    Math,
    Date,
    crypto: {
      randomUUID: () => crypto.randomUUID(),
      createHash: (alg) => crypto.createHash(alg),
    },
  };
  sandbox.exports = sandbox.module.exports;

  const script = new vm.Script(
    `${fn.source}\n; module.exports = module.exports.default || module.exports.handler || module.exports;`
  );
  const context = vm.createContext(sandbox);
  script.runInContext(context, { timeout: timeoutMs });

  const handler = sandbox.module.exports;
  if (typeof handler !== 'function') {
    throw Object.assign(
      new Error('function must export a handler: module.exports = async (req) => ...'),
      { status: 400 }
    );
  }

  const reqObj = {
    method: method || 'POST',
    headers: headers || {},
    body: body ?? null,
    query: query || {},
    instanceId,
    functionName: name,
  };

  const result = await Promise.race([
    Promise.resolve().then(() => handler(reqObj)),
    new Promise((_, reject) =>
      setTimeout(
        () => reject(Object.assign(new Error('function timeout'), { status: 504 })),
        timeoutMs + 50
      )
    ),
  ]);

  if (result == null) {
    return { status: 204, body: null };
  }
  if (typeof result === 'object' && (result.status || result.body !== undefined)) {
    return {
      status: Number(result.status) || 200,
      body: result.body !== undefined ? result.body : result,
      headers: result.headers || {},
    };
  }
  return { status: 200, body: result };
}

module.exports = {
  list,
  deploy,
  get,
  remove,
  invoke,
  sanitizeName,
};
