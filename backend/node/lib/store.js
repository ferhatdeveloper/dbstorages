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
  // No hardcoded demo credentials — supervisor comes from ensureSupervisorSeed()
  // when SUPERVISOR_EMAIL / SUPERVISOR_PASSWORD are set.
}

function newId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** In-memory audit log for supervisor when meta DB is down. */
const auditLog = [];
const domainOrders = [];

seedDemo();

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
