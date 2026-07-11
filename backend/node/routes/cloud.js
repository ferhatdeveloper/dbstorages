/**
 * Cloud Infrastructure REST API.
 * Auth + tenant membership required. Provider vendor names never appear in
 * business responses beyond the user-supplied providers.slug.
 */
const express = require('express');
const { authMiddleware } = require('../lib/auth');
const {
  assertTenantAccess,
  assertProjectAccess,
  listMemberships,
} = require('../lib/rbac');
const { CloudService } = require('../lib/cloud');

const router = express.Router();

function sendError(res, err) {
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'cloud_error',
      message: err.message || 'Cloud error',
      details: err.details || undefined,
    },
  });
}

/** Public VPS catalog (no auth) — retail = Hetzner × 1.20, EUR */
router.get('/public-catalog', (_req, res) => {
  try {
    const data = CloudService.publicCatalog();
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/quote', (req, res) => {
  try {
    const serverType = req.query.serverType || req.query.type;
    if (!serverType) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'serverType query required' },
      });
    }
    const data = CloudService.quoteServerType(String(serverType));
    if (!data) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Unknown server type' },
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

async function resolveTenant(req) {
  const memberships = await listMemberships(req.user.sub);
  const tenantId =
    req.body?.tenantId ||
    req.query?.tenantId ||
    req.user.tenantId ||
    memberships[0]?.tenant_id;
  if (!tenantId) {
    const err = new Error('No tenant membership');
    err.status = 403;
    err.code = 'no_tenant';
    throw err;
  }
  await assertTenantAccess(req.user.sub, tenantId);
  if (req.body?.projectId || req.query?.projectId) {
    const projectId = req.body?.projectId || req.query?.projectId;
    await assertProjectAccess(req.user.sub, projectId);
  }
  return tenantId;
}

router.use(authMiddleware);

router.get('/slugs', (_req, res) => {
  res.json({ success: true, data: CloudService.supportedSlugs() });
});

router.get('/providers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listProviders(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/providers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.createProvider({
      tenantId,
      projectId: req.body.projectId,
      name: req.body.name,
      slug: req.body.slug,
      apiKey: req.body.apiKey,
      config: req.body.config,
      createdBy: req.user.sub,
    });
    res.status(201).json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/servers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listServers(tenantId, {
      projectId: req.query.projectId,
    });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/servers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createServer({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      serverType: req.body.serverType,
      image: req.body.image,
      location: req.body.location,
      sshKeys: req.body.sshKeys,
      userData: req.body.userData,
      enableIpv4: req.body.enableIpv4,
      enableIpv6: req.body.enableIpv6,
      labels: req.body.labels,
      networks: req.body.networks,
      placementGroup: req.body.placementGroup,
      firewalls: req.body.firewalls,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.server,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/servers/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.getServer(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/servers/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteServer({
      tenantId,
      serverId: req.params.id,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});

function powerRoute(action) {
  return async (req, res) => {
    try {
      const tenantId = await resolveTenant(req);
      const operation = await CloudService.serverAction({
        tenantId,
        serverId: req.params.id,
        action,
        createdBy: req.user.sub,
      });
      res.status(202).json({
        success: true,
        operationId: operation.id,
        operation,
      });
    } catch (err) {
      sendError(res, err);
    }
  };
}

router.post('/servers/:id/reboot', powerRoute('reboot'));
router.post('/servers/:id/power-on', powerRoute('power_on'));
router.post('/servers/:id/power-off', powerRoute('power_off'));

router.get('/volumes', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listVolumes(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/volumes', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createVolume({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      sizeGb: req.body.sizeGb,
      location: req.body.location,
      serverId: req.body.serverId,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.volume,
      operationId: result.operation.id,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/volumes/:id/attach', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.attachVolume({
      tenantId,
      volumeId: req.params.id,
      serverId: req.body.serverId,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/volumes/:id/detach', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.detachVolume({
      tenantId,
      volumeId: req.params.id,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/firewalls', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listFirewalls(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/firewalls', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createFirewall({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      rules: req.body.rules,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.firewall,
      operationId: result.operation.id,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/snapshots', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listSnapshots(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/snapshots', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createSnapshot({
      tenantId,
      serverId: req.body.serverId,
      name: req.body.name,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.snapshot,
      operationId: result.operation.id,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/snapshots/:id/restore', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.restoreSnapshot({
      tenantId,
      snapshotId: req.params.id,
      name: req.body.name,
      serverType: req.body.serverType,
      location: req.body.location,
      sshKeys: req.body.sshKeys,
      userData: req.body.userData,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/ssh-keys', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listSshKeys(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/ssh-keys', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createSshKey({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      publicKey: req.body.publicKey,
      createdBy: req.user.sub,
    });
    res.status(201).json({ success: true, data: result.sshKey });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/networks', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listNetworks(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/networks', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createNetwork({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      ipRange: req.body.ipRange,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.network,
      operationId: result.operation.id,
    });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/operations', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.listOperations(tenantId, {
      limit: Number(req.query.limit) || 50,
    });
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/operations/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await CloudService.getOperation(req.params.id);
    if (!data || data.tenant_id !== tenantId) {
      return res.status(404).json({
        success: false,
        error: { code: 'not_found', message: 'Operation not found' },
      });
    }
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/catalog/:kind', async (req, res) => {
  try {
    await resolveTenant(req);
    const providerId = req.query.providerId;
    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'providerId query required' },
      });
    }
    const data = await CloudService.catalog(providerId, req.params.kind);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

async function catalogAlias(kind, req, res) {
  try {
    await resolveTenant(req);
    const providerId = req.query.providerId;
    if (!providerId) {
      return res.status(400).json({
        success: false,
        error: { code: 'validation', message: 'providerId query required' },
      });
    }
    const data = await CloudService.catalog(providerId, kind);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
}

router.get('/images', (req, res) => catalogAlias('images', req, res));
router.get('/regions', (req, res) => catalogAlias('regions', req, res));
router.get('/server-types', (req, res) => catalogAlias('server-types', req, res));

module.exports = router;
