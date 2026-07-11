/**
 * Quick smoke: load modules + exercise restQuery builder (no DB required).
 * Run from backend/node: node scripts/smoke-mvp.js
 */
const path = require('path');
const lib = (...p) => require(path.join(__dirname, '..', 'lib', ...p));

const { buildFromQuery } = lib('restQuery');
const auth = lib('auth');
const rbac = lib('rbac');
const db = lib('db');
const realtime = lib('realtime');
const provision = lib('provision');

const q = buildFromQuery({
  select: 'id,email',
  order: 'created_at.desc',
  limit: '10',
  id: 'eq.1',
  email: 'ilike.%@test.com',
});

if (!q.selectSql.includes('"id"')) throw new Error('select parse failed');
if (!q.whereSql.includes('ILIKE')) throw new Error('filter parse failed');
if (q.params.length !== 2) throw new Error('expected 2 params');

const token = auth.signToken(
  { id: 'usr_test', email: 'a@b.c', role: 'member' },
  { tenantId: 'ten_1', projectId: 'prj_1' }
);
const decoded = auth.verifyToken(token);
if (decoded.tenantId !== 'ten_1') throw new Error('jwt claims missing');

if (typeof db.resolveTenantPool !== 'function') throw new Error('resolveTenantPool missing');
if (typeof db.setTenantConnection !== 'function') throw new Error('setTenantConnection missing');
if (typeof rbac.assertInstanceAccess !== 'function') throw new Error('rbac missing');
if (typeof realtime.notifyChange !== 'function') throw new Error('realtime missing');
if (typeof provision.provisionOrFallback !== 'function') throw new Error('provision missing');

console.log('smoke-mvp: OK', {
  select: q.selectSql,
  where: q.whereSql,
  claims: { tenantId: decoded.tenantId, projectId: decoded.projectId },
});
