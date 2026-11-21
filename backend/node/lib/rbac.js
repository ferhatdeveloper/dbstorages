/**
 * Tenant / project / instance membership checks.
 * Memberships table is the source of truth (JWT claims are hints only).
 */

const { isMetaReady, getMetaPool } = require('./db');
const store = require('./store');

function accessError(status, message, code = 'forbidden') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

async function listMemberships(userId) {
  if (!userId) return [];
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT m.tenant_id, m.role, t.name AS tenant_name
       FROM memberships m
       JOIN tenants t ON t.id = m.tenant_id
       WHERE m.user_id = $1`,
      [userId]
    );
    return rows;
  }
  return store.memberships
    .filter((m) => m.user_id === userId)
    .map((m) => {
      const t = store.tenants.find((x) => x.id === m.tenant_id);
      return {
        tenant_id: m.tenant_id,
        role: m.role,
        tenant_name: t?.name || null,
      };
    });
}

async function userHasTenantAccess(userId, tenantId) {
  if (!userId || !tenantId) return false;
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT 1 FROM memberships WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [userId, tenantId]
    );
    return rows.length > 0;
  }
  return store.memberships.some(
    (m) => m.user_id === userId && m.tenant_id === tenantId
  );
}

async function userHasProjectAccess(userId, projectId) {
  if (!userId || !projectId) return false;
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT 1
       FROM projects p
       JOIN memberships m ON m.tenant_id = p.tenant_id
       WHERE p.id = $1 AND m.user_id = $2
       LIMIT 1`,
      [projectId, userId]
    );
    return rows.length > 0;
  }
  const project = store.projects.find((p) => p.id === projectId);
  if (!project) return false;
  return store.memberships.some(
    (m) => m.user_id === userId && m.tenant_id === project.tenant_id
  );
}

async function getInstanceForUser(userId, instanceId) {
  if (!userId || !instanceId) return null;
  if (isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT i.*, p.tenant_id, p.name AS project_name
       FROM instances i
       JOIN projects p ON p.id = i.project_id
       JOIN memberships m ON m.tenant_id = p.tenant_id
       WHERE i.id = $1
         AND m.user_id = $2
         AND i.status <> 'deleted'
       LIMIT 1`,
      [instanceId, userId]
    );
    return rows[0] || null;
  }
  const instance = store.instances.find((i) => i.id === instanceId);
  if (!instance || instance.status === 'deleted') return null;
  const ok = await userHasProjectAccess(userId, instance.project_id);
  return ok ? instance : null;
}

async function assertInstanceAccess(userId, instanceId) {
  if (!userId) throw accessError(401, 'Authentication required', 'unauthorized');
  const row = await getInstanceForUser(userId, instanceId);
  if (!row) throw accessError(403, 'Instance not found or access denied', 'forbidden');
  return row;
}

async function assertProjectAccess(userId, projectId) {
  if (!userId) throw accessError(401, 'Authentication required', 'unauthorized');
  const ok = await userHasProjectAccess(userId, projectId);
  if (!ok) throw accessError(403, 'Project not found or access denied', 'forbidden');
  return true;
}

async function assertTenantAccess(userId, tenantId) {
  if (!userId) throw accessError(401, 'Authentication required', 'unauthorized');
  const ok = await userHasTenantAccess(userId, tenantId);
  if (!ok) throw accessError(403, 'Tenant not found or access denied', 'forbidden');
  return true;
}

/** Primary tenant + project for JWT claims (hints only). */
async function primaryScopeForUser(userId) {
  const memberships = await listMemberships(userId);
  const tenantId = memberships[0]?.tenant_id || null;
  let projectId = null;
  if (tenantId && isMetaReady()) {
    const { rows } = await getMetaPool().query(
      `SELECT id FROM projects WHERE tenant_id = $1 ORDER BY created_at LIMIT 1`,
      [tenantId]
    );
    projectId = rows[0]?.id || null;
  } else if (tenantId) {
    const p = store.projects.find((x) => x.tenant_id === tenantId);
    projectId = p?.id || null;
  }
  return { tenantId, projectId, role: memberships[0]?.role || 'member' };
}

/**
 * Ensure user has at least one tenant + default project (onboarding / demo heal).
 * Idempotent: returns existing primary scope when membership already exists.
 */
async function ensureDefaultOrgForUser(userId, orgName = 'Default Org') {
  if (!userId) {
    throw accessError(401, 'Authentication required', 'unauthorized');
  }
  const existing = await primaryScopeForUser(userId);
  if (existing.tenantId) {
    if (!existing.projectId) {
      const projectId = store.newId('prj');
      const now = new Date().toISOString();
      if (isMetaReady()) {
        await getMetaPool().query(
          `INSERT INTO projects (id, tenant_id, name, env, created_at) VALUES ($1,$2,$3,'dev',$4)`,
          [projectId, existing.tenantId, 'Default Project', now]
        );
      } else {
        store.projects.push({
          id: projectId,
          tenant_id: existing.tenantId,
          name: 'Default Project',
          env: 'dev',
          created_at: now,
        });
      }
      return { ...existing, projectId, role: existing.role || 'owner' };
    }
    return existing;
  }

  const tenantId = store.newId('ten');
  const projectId = store.newId('prj');
  const now = new Date().toISOString();
  const name = String(orgName || 'Default Org').slice(0, 120);

  if (isMetaReady()) {
    const pool = getMetaPool();
    await pool.query(
      `INSERT INTO tenants (id, name, owner_user_id, created_at) VALUES ($1,$2,$3,$4)`,
      [tenantId, name, userId, now]
    );
    await pool.query(
      `INSERT INTO memberships (user_id, tenant_id, role) VALUES ($1,$2,'owner')
       ON CONFLICT (user_id, tenant_id) DO NOTHING`,
      [userId, tenantId]
    );
    await pool.query(
      `INSERT INTO projects (id, tenant_id, name, env, created_at) VALUES ($1,$2,$3,'dev',$4)`,
      [projectId, tenantId, 'Default Project', now]
    );
  } else {
    store.tenants.push({
      id: tenantId,
      name,
      owner_user_id: userId,
      created_at: now,
    });
    store.memberships.push({
      user_id: userId,
      tenant_id: tenantId,
      role: 'owner',
    });
    store.projects.push({
      id: projectId,
      tenant_id: tenantId,
      name: 'Default Project',
      env: 'dev',
      created_at: now,
    });
  }

  return { tenantId, projectId, role: 'owner' };
}

module.exports = {
  listMemberships,
  userHasTenantAccess,
  userHasProjectAccess,
  getInstanceForUser,
  assertInstanceAccess,
  assertProjectAccess,
  assertTenantAccess,
  primaryScopeForUser,
  ensureDefaultOrgForUser,
  accessError,
};
