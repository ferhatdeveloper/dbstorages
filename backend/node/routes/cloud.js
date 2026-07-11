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
const VpnService = require('../lib/cloud/vpn');

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
router.post('/servers/:id/reset', powerRoute('reset'));
router.post('/servers/:id/actions/:action', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const operation = await CloudService.serverAction({
      tenantId,
      serverId: req.params.id,
      action: req.params.action,
      body: req.body || {},
      createdBy: req.user.sub,
    });
    if (operation?.data && !operation.id) {
      return res.json({ success: true, data: operation.data });
    }
    res.status(202).json({
      success: true,
      operationId: operation.id,
      operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});

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

router.get('/parity', (_req, res) => {
  res.json({ success: true, data: CloudService.capabilityMatrix() });
});

// --- Volume delete / resize ---
router.delete('/volumes/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteVolume({
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

router.post('/volumes/:id/resize', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.resizeVolume({
      tenantId,
      volumeId: req.params.id,
      sizeGb: req.body.sizeGb,
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

// --- Firewall extras ---
router.delete('/firewalls/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteFirewall({
      tenantId,
      firewallId: req.params.id,
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

router.put('/firewalls/:id/rules', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.setFirewallRules({
      tenantId,
      firewallId: req.params.id,
      rules: req.body.rules,
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

router.post('/firewalls/:id/apply', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.applyFirewall({
      tenantId,
      firewallId: req.params.id,
      serverIds: req.body.serverIds,
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

router.delete('/snapshots/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteSnapshot({
      tenantId,
      snapshotId: req.params.id,
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

router.delete('/ssh-keys/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteSshKey({
      tenantId,
      keyId: req.params.id,
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

router.delete('/networks/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteNetwork({
      tenantId,
      networkId: req.params.id,
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

router.post('/networks/:id/:action', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.networkAction({
      tenantId,
      networkId: req.params.id,
      action: req.params.action,
      body: req.body,
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

function resourceCrud(listFn, createFn, deleteFn, extras = {}) {
  return { listFn, createFn, deleteFn, ...extras };
}

const primaryIpApi = resourceCrud(
  (t) => CloudService.listPrimaryIps(t),
  (opts) => CloudService.createPrimaryIp(opts),
  (opts) => CloudService.deletePrimaryIp(opts)
);
const floatingIpApi = resourceCrud(
  (t) => CloudService.listFloatingIps(t),
  (opts) => CloudService.createFloatingIp(opts),
  (opts) => CloudService.deleteFloatingIp(opts)
);

router.get('/primary-ips', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    res.json({ success: true, data: await primaryIpApi.listFn(tenantId) });
  } catch (err) {
    sendError(res, err);
  }
});
router.post('/primary-ips', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await primaryIpApi.createFn({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      type: req.body.type,
      datacenter: req.body.datacenter,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.primaryIp,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});
router.delete('/primary-ips/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await primaryIpApi.deleteFn({
      tenantId,
      id: req.params.id,
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
router.post('/primary-ips/:id/assign', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.assignPrimaryIp({
      tenantId,
      id: req.params.id,
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
router.post('/primary-ips/:id/unassign', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.unassignPrimaryIp({
      tenantId,
      id: req.params.id,
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

router.get('/floating-ips', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    res.json({ success: true, data: await floatingIpApi.listFn(tenantId) });
  } catch (err) {
    sendError(res, err);
  }
});
router.post('/floating-ips', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await floatingIpApi.createFn({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      type: req.body.type,
      location: req.body.location,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.floatingIp,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});
router.delete('/floating-ips/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await floatingIpApi.deleteFn({
      tenantId,
      id: req.params.id,
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
router.post('/floating-ips/:id/assign', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.assignFloatingIp({
      tenantId,
      id: req.params.id,
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
router.post('/floating-ips/:id/unassign', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.unassignFloatingIp({
      tenantId,
      id: req.params.id,
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

router.post('/dns/reverse', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.setReverseDns({
      tenantId,
      providerId: req.body.providerId,
      projectId: req.body.projectId,
      ip: req.body.ip,
      ptr: req.body.ptr,
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

router.get('/load-balancers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    res.json({ success: true, data: await CloudService.listLoadBalancers(tenantId) });
  } catch (err) {
    sendError(res, err);
  }
});
router.post('/load-balancers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createLoadBalancer({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      type: req.body.type,
      location: req.body.location,
      services: req.body.services,
      targets: req.body.targets,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.loadBalancer,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});
router.delete('/load-balancers/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteLoadBalancer({
      tenantId,
      id: req.params.id,
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

router.get('/placement-groups', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    res.json({ success: true, data: await CloudService.listPlacementGroups(tenantId) });
  } catch (err) {
    sendError(res, err);
  }
});
router.post('/placement-groups', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createPlacementGroup({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      type: req.body.type,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.placementGroup,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});
router.delete('/placement-groups/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deletePlacementGroup({
      tenantId,
      id: req.params.id,
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

router.get('/certificates', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    res.json({ success: true, data: await CloudService.listCertificates(tenantId) });
  } catch (err) {
    sendError(res, err);
  }
});
router.post('/certificates', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.createCertificate({
      tenantId,
      projectId: req.body.projectId,
      providerId: req.body.providerId,
      name: req.body.name,
      type: req.body.type,
      certificate: req.body.certificate,
      privateKey: req.body.privateKey,
      domainNames: req.body.domainNames,
      createdBy: req.user.sub,
    });
    res.status(202).json({
      success: true,
      data: result.certificate,
      operationId: result.operation.id,
      operation: result.operation,
    });
  } catch (err) {
    sendError(res, err);
  }
});
router.delete('/certificates/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await CloudService.deleteCertificate({
      tenantId,
      id: req.params.id,
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

// --- WireGuard VPN add-on ---
router.get('/vpn/status', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await VpnService.status(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/vpn/enable', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const network = await VpnService.enable({
      tenantId,
      createdBy: req.user.sub,
      name: req.body?.name || 'default',
    });
    res.status(201).json({ success: true, data: network });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/vpn/peers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await VpnService.listPeers(tenantId);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.post('/vpn/peers', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const result = await VpnService.createPeer({
      tenantId,
      userId: req.user.sub,
      createdBy: req.user.sub,
      name: req.body?.name,
      serverId: req.body?.serverId,
      allowedIps: req.body?.allowedIps,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/vpn/peers/:id/config', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await VpnService.peerConfig(tenantId, req.params.id);
    if (req.query.download === '1' || req.query.download === 'true') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${data.filename || 'wg.conf'}"`
      );
      return res.send(data.config);
    }
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

router.get('/vpn/peers/:id/qr', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await VpnService.peerConfig(tenantId, req.params.id);
    if (!data.qrDataUrl) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'qr_unavailable',
          message: 'QR üretilemedi — qrcode paketi veya config eksik',
        },
      });
    }
    if (req.query.format === 'json') {
      return res.json({ success: true, data: { qrDataUrl: data.qrDataUrl } });
    }
    const b64 = data.qrDataUrl.replace(/^data:image\/png;base64,/, '');
    res.setHeader('Content-Type', 'image/png');
    res.send(Buffer.from(b64, 'base64'));
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/vpn/peers/:id', async (req, res) => {
  try {
    const tenantId = await resolveTenant(req);
    const data = await VpnService.revokePeer(tenantId, req.params.id);
    res.json({ success: true, data });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;
