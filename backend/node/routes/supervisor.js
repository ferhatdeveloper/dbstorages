const express = require('express');
const { authMiddleware } = require('../lib/auth');
const { requireSupervisor, writeAudit } = require('../lib/supervisor');
const { isMetaReady, getMetaPool } = require('../lib/db');
const store = require('../lib/store');
const {
  provisionInstanceAfterPayment,
  findInstanceByPayment,
} = require('./billing');

const router = express.Router();

router.use(authMiddleware, requireSupervisor);

function parsePaging(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

router.get('/overview', async (_req, res) => {
  try {
    if (isMetaReady()) {
      const pool = getMetaPool();
      const [users, tenants, payments, servers, instances] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS n FROM platform_users`),
        pool.query(`SELECT COUNT(*)::int AS n FROM tenants`),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM payments WHERE status = 'succeeded'`
        ),
        pool.query(`SELECT COUNT(*)::int AS n FROM cloud_servers`),
        pool.query(
          `SELECT COUNT(*)::int AS n FROM instances WHERE deleted_at IS NULL`
        ),
      ]);
      return res.json({
        success: true,
        data: {
          users: users.rows[0].n,
          tenants: tenants.rows[0].n,
          paymentsSucceeded: payments.rows[0].n,
          cloudServers: servers.rows[0].n,
          instances: instances.rows[0].n,
        },
      });
    }
    res.json({
      success: true,
      data: {
        users: store.users.size,
        tenants: store.tenants.length,
        paymentsSucceeded: store.payments.filter((p) => p.status === 'succeeded')
          .length,
        cloudServers: 0,
        instances: store.instances.length,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/users', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePaging(req.query);
    const q = String(req.query.q || '').trim().toLowerCase();
    if (isMetaReady()) {
      const params = [];
      let where = '';
      if (q) {
        params.push(`%${q}%`);
        where = `WHERE lower(email) LIKE $1 OR lower(name) LIKE $1`;
      }
      const countRes = await getMetaPool().query(
        `SELECT COUNT(*)::int AS n FROM platform_users ${where}`,
        params
      );
      const listParams = [...params, pageSize, offset];
      const lim = params.length + 1;
      const off = params.length + 2;
      const { rows } = await getMetaPool().query(
        `SELECT id, email, name, role, disabled, created_at
         FROM platform_users ${where}
         ORDER BY created_at DESC
         LIMIT $${lim} OFFSET $${off}`,
        listParams
      );
      return res.json({
        success: true,
        data: rows,
        page,
        pageSize,
        total: countRes.rows[0].n,
      });
    }
    let list = [...store.users.values()].map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      disabled: Boolean(u.disabled),
      created_at: u.created_at,
    }));
    if (q) {
      list = list.filter(
        (u) =>
          u.email.toLowerCase().includes(q) ||
          String(u.name || '')
            .toLowerCase()
            .includes(q)
      );
    }
    const total = list.length;
    list = list.slice(offset, offset + pageSize);
    res.json({ success: true, data: list, page, pageSize, total });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.patch('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { role, disabled } = req.body || {};
    if (role != null && !['member', 'supervisor', 'admin'].includes(role)) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'invalid role' },
      });
    }
    if (isMetaReady()) {
      const sets = [];
      const params = [];
      if (role != null) {
        params.push(role);
        sets.push(`role = $${params.length}`);
      }
      if (disabled != null) {
        params.push(Boolean(disabled));
        sets.push(`disabled = $${params.length}`);
      }
      if (!sets.length) {
        return res.status(400).json({
          success: false,
          error: { code: 'validation', message: 'nothing to update' },
        });
      }
      params.push(id);
      const { rows } = await getMetaPool().query(
        `UPDATE platform_users SET ${sets.join(', ')}
         WHERE id = $${params.length}
         RETURNING id, email, name, role, disabled, created_at`,
        params
      );
      if (!rows[0]) {
        return res.status(404).json({
          success: false,
          error: { code: 'not_found', message: 'user not found' },
        });
      }
      await writeAudit({
        actorUserId: req.user.sub,
        action: 'user.update',
        entityType: 'platform_user',
        entityId: id,
        meta: { role, disabled },
      });
      return res.json({ success: true, data: rows[0] });
    }
    const user = [...store.users.values()].find((u) => u.id === id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'user not found' },
      });
    }
    if (role != null) user.role = role;
    if (disabled != null) user.disabled = Boolean(disabled);
    await writeAudit({
      actorUserId: req.user.sub,
      action: 'user.update',
      entityType: 'platform_user',
      entityId: id,
      meta: { role, disabled },
    });
    res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        disabled: Boolean(user.disabled),
        created_at: user.created_at,
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/tenants', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePaging(req.query);
    if (isMetaReady()) {
      const countRes = await getMetaPool().query(
        `SELECT COUNT(*)::int AS n FROM tenants`
      );
      const { rows } = await getMetaPool().query(
        `SELECT t.id, t.name, t.owner_user_id, t.created_at,
                u.email AS owner_email,
                (SELECT COUNT(*)::int FROM memberships m WHERE m.tenant_id = t.id) AS member_count,
                (SELECT COUNT(*)::int FROM projects p WHERE p.tenant_id = t.id) AS project_count,
                (SELECT COUNT(*)::int FROM instances i
                   JOIN projects p ON p.id = i.project_id
                   WHERE p.tenant_id = t.id AND i.deleted_at IS NULL) AS instance_count,
                (SELECT COUNT(*)::int FROM cloud_servers s WHERE s.tenant_id = t.id) AS server_count
         FROM tenants t
         LEFT JOIN platform_users u ON u.id = t.owner_user_id
         ORDER BY t.created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );
      return res.json({
        success: true,
        data: rows,
        page,
        pageSize,
        total: countRes.rows[0].n,
      });
    }
    const list = store.tenants.map((t) => ({
      id: t.id,
      name: t.name,
      owner_user_id: t.owner_user_id,
      owner_email:
        [...store.users.values()].find((u) => u.id === t.owner_user_id)
          ?.email || null,
      created_at: t.created_at,
      member_count: store.memberships.filter((m) => m.tenant_id === t.id)
        .length,
      project_count: store.projects.filter((p) => p.tenant_id === t.id).length,
      instance_count: store.instances.filter((i) => {
        const p = store.projects.find((x) => x.id === i.project_id);
        return p?.tenant_id === t.id;
      }).length,
      server_count: 0,
    }));
    res.json({
      success: true,
      data: list.slice(offset, offset + pageSize),
      page,
      pageSize,
      total: list.length,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (isMetaReady()) {
      const pool = getMetaPool();
      const { rows: tenants } = await pool.query(
        `SELECT t.*, u.email AS owner_email FROM tenants t
         LEFT JOIN platform_users u ON u.id = t.owner_user_id
         WHERE t.id = $1`,
        [id]
      );
      if (!tenants[0]) {
        return res.status(404).json({
          success: false,
          error: { code: 'not_found', message: 'tenant not found' },
        });
      }
      const [members, instances, servers, payments] = await Promise.all([
        pool.query(
          `SELECT m.user_id, m.role, u.email, u.name
           FROM memberships m JOIN platform_users u ON u.id = m.user_id
           WHERE m.tenant_id = $1`,
          [id]
        ),
        pool.query(
          `SELECT i.id, i.name, i.plan, i.status, i.created_at
           FROM instances i JOIN projects p ON p.id = i.project_id
           WHERE p.tenant_id = $1 AND i.deleted_at IS NULL
           ORDER BY i.created_at DESC LIMIT 50`,
          [id]
        ),
        pool.query(
          `SELECT id, name, status, server_type, ipv4, created_at
           FROM cloud_servers WHERE tenant_id = $1
           ORDER BY created_at DESC LIMIT 50`,
          [id]
        ),
        pool.query(
          `SELECT id, provider, plan_id, amount_cents, currency, status, created_at
           FROM payments WHERE tenant_id = $1
           ORDER BY created_at DESC LIMIT 50`,
          [id]
        ),
      ]);
      return res.json({
        success: true,
        data: {
          tenant: tenants[0],
          memberships: members.rows,
          instances: instances.rows,
          servers: servers.rows,
          payments: payments.rows,
        },
      });
    }
    const tenant = store.tenants.find((t) => t.id === id);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'tenant not found' },
      });
    }
    res.json({
      success: true,
      data: {
        tenant,
        memberships: store.memberships
          .filter((m) => m.tenant_id === id)
          .map((m) => {
            const u = [...store.users.values()].find((x) => x.id === m.user_id);
            return {
              user_id: m.user_id,
              role: m.role,
              email: u?.email,
              name: u?.name,
            };
          }),
        instances: store.instances.filter((i) => {
          const p = store.projects.find((x) => x.id === i.project_id);
          return p?.tenant_id === id;
        }),
        servers: [],
        payments: store.payments.filter((p) => p.tenantId === id),
      },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/payments', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePaging(req.query);
    const provider = String(req.query.provider || '').trim();
    const status = String(req.query.status || '').trim();
    const tenantId = String(req.query.tenantId || '').trim();
    if (isMetaReady()) {
      const clauses = [];
      const params = [];
      if (provider) {
        params.push(provider);
        clauses.push(`provider = $${params.length}`);
      }
      if (status) {
        params.push(status);
        clauses.push(`status = $${params.length}`);
      }
      if (tenantId) {
        params.push(tenantId);
        clauses.push(`tenant_id = $${params.length}`);
      }
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const countRes = await getMetaPool().query(
        `SELECT COUNT(*)::int AS n FROM payments ${where}`,
        params
      );
      params.push(pageSize, offset);
      const { rows } = await getMetaPool().query(
        `SELECT * FROM payments ${where}
         ORDER BY created_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return res.json({
        success: true,
        data: rows,
        page,
        pageSize,
        total: countRes.rows[0].n,
      });
    }
    let list = [...store.payments];
    if (provider) list = list.filter((p) => p.provider === provider);
    if (status) list = list.filter((p) => p.status === status);
    if (tenantId) list = list.filter((p) => p.tenantId === tenantId);
    const total = list.length;
    res.json({
      success: true,
      data: list.slice(offset, offset + pageSize),
      page,
      pageSize,
      total,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.get('/cloud/servers', async (req, res) => {
  try {
    const { page, pageSize, offset } = parsePaging(req.query);
    if (isMetaReady()) {
      const countRes = await getMetaPool().query(
        `SELECT COUNT(*)::int AS n FROM cloud_servers`
      );
      const { rows } = await getMetaPool().query(
        `SELECT s.id, s.tenant_id, s.name, s.status, s.server_type, s.ipv4,
                s.created_at, t.name AS tenant_name
         FROM cloud_servers s
         LEFT JOIN tenants t ON t.id = s.tenant_id
         ORDER BY s.created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      );
      return res.json({
        success: true,
        data: rows,
        page,
        pageSize,
        total: countRes.rows[0].n,
      });
    }
    res.json({ success: true, data: [], page, pageSize, total: 0 });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

router.post('/payments/:id/replay-provision', async (req, res) => {
  try {
    const { id } = req.params;
    let payment = null;
    if (isMetaReady()) {
      const { rows } = await getMetaPool().query(
        `SELECT * FROM payments WHERE id = $1 LIMIT 1`,
        [id]
      );
      payment = rows[0] || null;
    } else {
      payment = store.payments.find((p) => p.id === id) || null;
    }
    if (!payment) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'payment not found' },
      });
    }
    const userId = payment.user_id || payment.userId;
    const planId = payment.plan_id || payment.planId || 'pro';
    let meta = payment.metadata || {};
    if (typeof meta === 'string') {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = {};
      }
    }
    const existing = await findInstanceByPayment(
      payment.id,
      payment.external_id || payment.externalId
    );
    const instance = await provisionInstanceAfterPayment({
      userId,
      planId,
      projectId: meta.projectId || null,
      provider: payment.provider,
      paymentId: payment.id,
      externalId: payment.external_id || payment.externalId,
    });
    await writeAudit({
      actorUserId: req.user.sub,
      action: 'payment.replay_provision',
      entityType: 'payment',
      entityId: id,
      meta: { reused: Boolean(existing) },
    });
    res.json({
      success: true,
      data: { instance, reused: Boolean(existing) },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: { code: 'server', message: err.message },
    });
  }
});

module.exports = { router };
