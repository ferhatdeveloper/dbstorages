/**
 * Platform supervisor helpers — cross-tenant admin access.
 */

const { isMetaReady, getMetaPool } = require('./db');
const store = require('./store');

const SUPERVISOR_ROLES = new Set(['supervisor', 'admin']);

function isSupervisorRole(role) {
  return SUPERVISOR_ROLES.has(String(role || '').toLowerCase());
}

function requireSupervisor(req, res, next) {
  const role = req.user?.role;
  if (!req.user?.sub || !isSupervisorRole(role)) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'forbidden',
        message: 'Supervisor access required',
      },
    });
  }
  next();
}

async function writeAudit({ actorUserId, action, entityType, entityId, meta }) {
  const id = store.newId('aud');
  const createdAt = new Date().toISOString();
  const record = {
    id,
    actor_user_id: actorUserId || null,
    action,
    entity_type: entityType || null,
    entity_id: entityId || null,
    meta: meta || {},
    created_at: createdAt,
  };
  if (isMetaReady()) {
    await getMetaPool().query(
      `INSERT INTO audit_log (id, actor_user_id, action, entity_type, entity_id, meta, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)`,
      [
        id,
        record.actor_user_id,
        action,
        record.entity_type,
        record.entity_id,
        JSON.stringify(record.meta),
        createdAt,
      ]
    );
  } else {
    store.auditLog.unshift(record);
  }
  return record;
}

/**
 * Promote configured emails / demo user to supervisor on boot (idempotent).
 */
async function ensureSupervisorSeed() {
  const emails = String(process.env.SUPERVISOR_EMAIL || 'demo@graphcore.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!emails.length) return;

  if (isMetaReady()) {
    for (const email of emails) {
      await getMetaPool().query(
        `UPDATE platform_users SET role = 'supervisor'
         WHERE lower(email) = $1 AND role IS DISTINCT FROM 'supervisor'`,
        [email]
      );
    }
  } else {
    for (const [, user] of store.users) {
      if (emails.includes(String(user.email || '').toLowerCase())) {
        user.role = 'supervisor';
      }
    }
  }
}

module.exports = {
  SUPERVISOR_ROLES,
  isSupervisorRole,
  requireSupervisor,
  writeAudit,
  ensureSupervisorSeed,
};
