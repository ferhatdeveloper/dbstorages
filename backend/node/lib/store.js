/**
 * In-memory fallback when meta Postgres is down.
 * Keeps control-plane usable for local UI smoke tests.
 */

const { randomUUID } = require('crypto');

const users = new Map();
const tenants = [];
const projects = [];
const instances = [];
const payments = [];
const memberships = [];

function seedDemo() {
  if (users.size > 0) return;
  const id = 'usr_demo';
  const demoPasswordHash =
    '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
  users.set('demo@graphcore.com', {
    id,
    email: 'demo@graphcore.com',
    name: 'Demo Kullanıcı',
    // bcrypt of "demo123"
    password_hash: demoPasswordHash,
    role: 'supervisor',
    disabled: false,
    created_at: new Date().toISOString(),
  });
  users.set('demo@dbstorages.com', {
    id: 'usr_demo_dbstorages',
    email: 'demo@dbstorages.com',
    name: 'Demo Kullanıcı',
    password_hash: demoPasswordHash,
    role: 'supervisor',
    disabled: false,
    created_at: new Date().toISOString(),
  });
  tenants.push({
    id: 'ten_demo',
    name: 'Demo Org',
    owner_user_id: id,
    created_at: new Date().toISOString(),
  });
  memberships.push({ user_id: id, tenant_id: 'ten_demo', role: 'owner' });
  projects.push({
    id: 'prj_demo',
    tenant_id: 'ten_demo',
    name: 'Demo Project',
    env: 'dev',
    created_at: new Date().toISOString(),
  });
  instances.push({
    id: 'ins_demo',
    project_id: 'prj_demo',
    name: 'demo-db',
    plan: 'starter',
    region: 'local',
    status: 'ready',
    host: 'localhost',
    port: 5432,
    database_name: 'graphcore_demo',
    username: 'graphcore',
    password: 'graphcore',
    connection_string:
      'postgresql://graphcore:graphcore@localhost:5432/graphcore_demo',
    created_at: new Date().toISOString(),
  });
}

/** In-memory audit log for supervisor when meta DB is down. */
const auditLog = [];
const domainOrders = [];


seedDemo();

function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

module.exports = {
  users,
  tenants,
  projects,
  instances,
  payments,
  memberships,
  auditLog,
  domainOrders,
  newId,
  seedDemo,
};
