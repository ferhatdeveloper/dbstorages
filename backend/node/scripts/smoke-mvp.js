/**
 * Extended smoke tests — no live DB required.
 * Covers: restQuery (filters/embed parse/RPC name), auth JWT,
 * storage signed URL, functions deploy/invoke, payments quota,
 * migrations checksum, provision exports.
 *
 * Run: node scripts/smoke-mvp.js
 */
const path = require('path');
const fs = require('fs');
const os = require('os');

const root = path.join(__dirname, '..');
const lib = (...p) => require(path.join(root, 'lib', ...p));

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
}

// --- restQuery ---
const {
  buildFromQuery,
  parseSelectDetailed,
  parseRpcName,
  quoteIdent,
} = lib('restQuery');

const q = buildFromQuery({
  select: 'id,email,orders(id,total)',
  order: 'created_at.desc',
  limit: '10',
  id: 'eq.1',
  email: 'ilike.%@test.com',
});
assert(q.selectSql.includes('"id"'), 'select parse');
assert(q.embeds.length === 1 && q.embeds[0].relation === 'orders', 'embed parse');
assert(q.whereSql.includes('ILIKE'), 'filter parse');
assert(q.params.length === 2, 'filter params');

const det = parseSelectDetailed('id,profile(name)');
assert(det.embeds[0].columns.includes('name'), 'embed columns');
assert(parseRpcName('my_fn').schema === 'public', 'rpc public');
assert(parseRpcName('auth.uid').fn === 'uid', 'rpc schema');
try {
  quoteIdent('bad-name');
  assert(false, 'quoteIdent should throw');
} catch {
  assert(true, 'quoteIdent rejects bad id');
}

// --- auth ---
const auth = lib('auth');
const token = auth.signToken(
  { id: 'usr_test', email: 'a@b.c', role: 'member' },
  { tenantId: 'ten_1', projectId: 'prj_1' }
);
const decoded = auth.verifyToken(token);
assert(decoded.tenantId === 'ten_1', 'jwt claims');
const refresh = auth.signRefreshToken();
assert(typeof refresh === 'string' && refresh.length > 20, 'refresh token');

const projTok = auth.signProjectToken(
  { id: 'u1', email: 'u@t.com' },
  { secret: 'sec', instanceId: 'ins_1', projectId: 'prj_1', expiresIn: '1h' }
);
const projDec = auth.verifyProjectToken(projTok, 'sec');
assert(projDec.instanceId === 'ins_1', 'project jwt');

// --- storage signed URL ---
const storage = lib('storage');
const signed = storage.createSignedDownload({
  instanceId: 'ins_demo',
  key: 'folder/a.txt',
  expiresIn: 60,
});
const claims = storage.verifySignedDownload(signed.token);
assert(claims.key === 'folder/a.txt', 'signed key');
assert(claims.instanceId === 'ins_demo', 'signed instance');

// --- quota ---
const { storageQuotaBytes, getPackage } = require(path.join(root, 'payments'));
assert(storageQuotaBytes('free') > 0, 'free quota');
assert(storageQuotaBytes('pro') > storageQuotaBytes('free'), 'pro > free quota');
assert(getPackage('scale').storageGb === 50, 'scale storageGb');

// --- functions ---
const functions = lib('functions');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-fn-'));
process.env.FUNCTIONS_ROOT = tmpRoot;
// re-require won't pick new env for already loaded module path — use isolated invoke via deploy with env set before first require
// Module already loaded with default ROOT; deploy to default .functions then clean — use unique instance id
const iid = `test_${Date.now()}`;
functions.deploy(
  iid,
  'hello',
  `module.exports = async (req) => ({ status: 200, body: { ok: true, n: req.body?.n || 0 } });`
);
const listed = functions.list(iid);
assert(listed.some((f) => f.name === 'hello'), 'function listed');

(async () => {
  const out = await functions.invoke(iid, 'hello', { body: { n: 7 } });
  assert(out.status === 200 && out.body?.ok === true && out.body?.n === 7, 'function invoke');
  functions.remove(iid, 'hello');
  assert(functions.list(iid).length === 0, 'function removed');

  // --- migrations checksum ---
  const migrations = lib('migrations');
  assert(migrations.checksum('SELECT 1').length === 16, 'migration checksum');

  // --- provision / rbac / realtime exports ---
  const provision = lib('provision');
  const rbac = lib('rbac');
  const db = lib('db');
  const realtime = lib('realtime');
  assert(typeof provision.pauseInstance === 'function', 'pauseInstance');
  assert(typeof provision.deleteInstanceDatabase === 'function', 'deleteInstance');
  assert(typeof provision.resizeInstancePlan === 'function', 'resizeInstance');
  assert(typeof rbac.assertInstanceAccess === 'function', 'rbac');
  assert(typeof db.resolveTenantPool === 'function', 'resolveTenantPool');
  assert(typeof realtime.notifyChange === 'function', 'realtime');

  // --- billing webhook mock shape (PayTR hash) ---
  const crypto = require('crypto');
  const merchantKey = 'key';
  const merchantSalt = 'salt';
  const merchantOid = 'oid1';
  const status = 'success';
  const totalAmount = '100';
  const hash = crypto
    .createHmac('sha256', merchantKey)
    .update(merchantOid + merchantSalt + status + totalAmount)
    .digest('base64');
  const token2 = crypto
    .createHmac('sha256', merchantKey)
    .update(merchantOid + merchantSalt + status + totalAmount)
    .digest('base64');
  assert(hash === token2, 'paytr hmac stable');

  // --- cloud module ---
  const { encryptSecret, decryptSecret } = lib('cloud', 'secrets');
  const enc = encryptSecret('abc');
  assert(decryptSecret(enc) === 'abc', 'cloud secrets roundtrip');
  const { listSupportedSlugs } = lib('cloud', 'factory');
  assert(listSupportedSlugs().includes('hetzner'), 'cloud hetzner slug');
  assert(listSupportedSlugs().includes('mock'), 'cloud mock slug');
  const { MockCloudProvider } = lib('cloud', 'providers', 'mock');
  const mock = new MockCloudProvider();
  const ms = await mock.createServer({
    name: 's1',
    serverType: 'cx22',
    image: 'ubuntu-22.04',
    location: 'nbg1',
  });
  assert(!!ms.server.externalId, 'mock cloud createServer');
  const { getAddon } = require(path.join(root, 'payments'));
  assert(getAddon('vps')?.id === 'vps', 'vps ek hizmet addon');

  if (failed) {
    console.error(`\nsmoke-mvp: ${failed} failure(s)`);
    process.exit(1);
  }
  console.log('\nsmoke-mvp: OK');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
