/**
 * Platform supervisor helpers — cross-tenant admin access.
 */

const { isMetaReady, getMetaPool } = require('./db');
const store = require('./store');
const { hashPassword } = require('./auth');

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

function supervisorEmailsFromEnv() {
  return String(process.env.SUPERVISOR_EMAIL || 'info@dbstorages.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Promote / upsert configured supervisor emails (idempotent).
 * Optional SUPERVISOR_PASSWORD creates the first supervisor if missing.
 */
async function ensureSupervisorSeed() {
  const emails = supervisorEmailsFromEnv();
  if (!emails.length) return;

  const password = String(process.env.SUPERVISOR_PASSWORD || '').trim();
  const displayName = String(
    process.env.SUPERVISOR_NAME || 'Supervisor'
  ).trim();

  if (isMetaReady()) {
    const pool = getMetaPool();
    for (const email of emails) {
      const existing = await pool.query(
        `SELECT id, role FROM platform_users WHERE lower(email) = $1 LIMIT 1`,
        [email]
      );
      if (existing.rows[0]) {
        await pool.query(
          `UPDATE platform_users
           SET role = 'supervisor', disabled = FALSE
           WHERE id = $1 AND (role IS DISTINCT FROM 'supervisor' OR disabled IS TRUE)`,
          [existing.rows[0].id]
        );
      } else if (password.length >= 8) {
        const id = store.newId('usr');
        const password_hash = await hashPassword(password);
        const created_at = new Date().toISOString();
        await pool.query(
          `INSERT INTO platform_users (id, email, name, password_hash, role, created_at)
           VALUES ($1,$2,$3,$4,'supervisor',$5)`,
          [id, email, displayName, password_hash, created_at]
        );
      }
    }

    // Retire legacy demo supervisor accounts
    await pool.query(
      `UPDATE platform_users
       SET disabled = TRUE,
           role = CASE WHEN role IN ('supervisor','admin') THEN 'member' ELSE role END
       WHERE lower(email) IN ('demo@dbstorages.com', 'demo@graphcore.com')
         AND disabled IS DISTINCT FROM TRUE`
    );
  } else {
    for (const email of emails) {
      let user = store.users.get(email);
      if (!user && password.length >= 8) {
        const id = store.newId('usr');
        const password_hash = await hashPassword(password);
        user = {
          id,
          email,
          name: displayName,
          password_hash,
          role: 'supervisor',
          disabled: false,
          created_at: new Date().toISOString(),
        };
        store.users.set(email, user);
      } else if (user) {
        user.role = 'supervisor';
        user.disabled = false;
        if (password.length >= 8) {
          user.password_hash = await hashPassword(password);
        }
      }
    }
    for (const demoEmail of ['demo@dbstorages.com', 'demo@graphcore.com']) {
      const demo = store.users.get(demoEmail);
      if (demo) {
        demo.disabled = true;
        if (demo.role === 'supervisor' || demo.role === 'admin') {
          demo.role = 'member';
        }
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
  supervisorEmailsFromEnv,
};
