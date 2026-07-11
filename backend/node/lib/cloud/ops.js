/**
 * Extended cloud operations — register queue handlers + CloudService methods.
 */
const extras = require('./repositoryExtras');
const repo = require('./repository');
const { cloudError } = require('./errors');

function wireExtraHandlers(queue, resolveDriver, newId) {
  const syncServer = async (op, method, patchFn) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver[method](server.external_id, ...(op.request.args || []));
    if (patchFn) await patchFn(server, out, op);
    return { action: out.action || out, result: out };
  };

  queue.registerHandler('reset', (op) => syncServer(op, 'reset'));
  queue.registerHandler('resize_server', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.resize(server.external_id, op.request.serverType);
    await repo.updateServer(server.id, { serverType: op.request.serverType });
    return { action: out.action };
  });
  queue.registerHandler('rebuild', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.rebuild(server.external_id, op.request.image);
    await repo.updateServer(server.id, {
      image: op.request.image,
      metadata: {
        ...(server.metadata || {}),
        rootPasswordSet: Boolean(out.rootPassword),
      },
    });
    return { action: out.action, rootPasswordSet: Boolean(out.rootPassword) };
  });
  queue.registerHandler('enable_rescue', (op) => syncServer(op, 'enableRescue'));
  queue.registerHandler('disable_rescue', (op) => syncServer(op, 'disableRescue'));
  queue.registerHandler('rename_server', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    await driver.renameServer(server.external_id, op.request.name);
    await repo.updateServer(server.id, { name: op.request.name });
    return { name: op.request.name };
  });
  queue.registerHandler('change_protection', (op) =>
    syncServer(op, 'changeServerProtection')
  );
  queue.registerHandler('update_labels', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    await driver.updateServerLabels(server.external_id, op.request.labels || {});
    await repo.updateServer(server.id, { labels: op.request.labels || {} });
    return { labels: op.request.labels || {} };
  });
  queue.registerHandler('attach_iso', (op) => syncServer(op, 'attachIso'));
  queue.registerHandler('detach_iso', (op) => syncServer(op, 'detachIso'));
  queue.registerHandler('request_console', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.requestConsole(server.external_id);
    await repo.updateServer(server.id, {
      metadata: {
        ...(server.metadata || {}),
        console: {
          wssUrl: out.wssUrl,
          requestedAt: new Date().toISOString(),
        },
      },
    });
    return {
      action: out.action,
      wssUrl: out.wssUrl,
      password: out.password,
    };
  });
  queue.registerHandler('enable_backup', async (op) => {
    const out = await syncServer(op, 'enableBackup');
    const server = await repo.getServer(op.resource_id);
    await repo.updateServer(server.id, {
      metadata: { ...(server.metadata || {}), backupsEnabled: true },
    });
    return out;
  });
  queue.registerHandler('disable_backup', async (op) => {
    const out = await syncServer(op, 'disableBackup');
    const server = await repo.getServer(op.resource_id);
    await repo.updateServer(server.id, {
      metadata: { ...(server.metadata || {}), backupsEnabled: false },
    });
    return out;
  });

  queue.registerHandler('delete_volume', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const volume = await repo.getVolume(op.resource_id);
    if (volume?.external_id) await driver.deleteVolume(volume.external_id);
    if (isMetaReadySafe()) {
      await require('../db')
        .getMetaPool()
        .query('DELETE FROM cloud_volumes WHERE id = $1', [op.resource_id]);
    } else {
      const store = require('../store');
      store.cloudVolumes = (store.cloudVolumes || []).filter(
        (v) => v.id !== op.resource_id
      );
    }
    return { deleted: true };
  });

  queue.registerHandler('resize_volume', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const volume = await repo.getVolume(op.resource_id);
    if (!volume?.external_id) throw cloudError(400, 'Volume has no external id');
    const out = await driver.resizeVolume(volume.external_id, op.request.sizeGb);
    await repo.updateVolume(volume.id, {
      size_gb: op.request.sizeGb,
      status: 'available',
    });
    return { action: out.action };
  });

  queue.registerHandler('delete_firewall', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const fw = await repo.getFirewall(op.resource_id);
    if (fw?.external_id) await driver.deleteFirewall(fw.external_id);
    await repo.deleteFirewallRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('set_firewall_rules', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const fw = await repo.getFirewall(op.resource_id);
    if (!fw?.external_id) throw cloudError(400, 'Firewall has no external id');
    const out = await driver.setFirewallRules(fw.external_id, op.request.rules);
    const store = require('../store');
    if (fw) fw.rules = op.request.rules;
    if (!require('../db').isMetaReady() && store.cloudFirewalls) {
      const i = store.cloudFirewalls.findIndex((f) => f.id === fw.id);
      if (i >= 0) store.cloudFirewalls[i].rules = op.request.rules;
    } else if (require('../db').isMetaReady()) {
      await require('../db')
        .getMetaPool()
        .query(`UPDATE cloud_firewalls SET rules = $1::jsonb WHERE id = $2`, [
          JSON.stringify(op.request.rules || []),
          fw.id,
        ]);
    }
    return { action: out.action };
  });

  queue.registerHandler('apply_firewall', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const fw = await repo.getFirewall(op.resource_id);
    if (!fw?.external_id) throw cloudError(400, 'Firewall has no external id');
    const applyTo = [];
    for (const sid of op.request.serverIds || []) {
      const s = await repo.getServer(sid);
      if (s?.external_id) {
        applyTo.push({ type: 'server', server: Number(s.external_id) });
      }
    }
    const out = await driver.applyFirewallToResources(fw.external_id, applyTo);
    return { action: out.action, applied: applyTo.length };
  });

  queue.registerHandler('delete_snapshot', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const snap = await repo.getSnapshot(op.resource_id);
    if (snap?.external_id) await driver.deleteSnapshot(snap.external_id);
    const store = require('../store');
    if (!require('../db').isMetaReady()) {
      store.cloudSnapshots = (store.cloudSnapshots || []).filter(
        (s) => s.id !== op.resource_id
      );
    } else {
      await require('../db')
        .getMetaPool()
        .query('DELETE FROM cloud_snapshots WHERE id = $1', [op.resource_id]);
    }
    return { deleted: true };
  });

  queue.registerHandler('delete_ssh_key', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const key = await repo.getSshKey(op.resource_id);
    if (key?.external_id) await driver.deleteSSHKey(key.external_id);
    await repo.deleteSshKeyRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('delete_network', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const net = await getNetwork(op.resource_id);
    if (net?.external_id) await driver.deleteNetwork(net.external_id);
    await deleteNetworkRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('network_add_subnet', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const net = await getNetwork(op.resource_id);
    if (!net?.external_id) throw cloudError(400, 'Network has no external id');
    const out = await driver.addNetworkSubnet(net.external_id, op.request.subnet);
    return { action: out.action };
  });

  queue.registerHandler('network_attach_server', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const net = await getNetwork(op.resource_id);
    const server = await repo.getServer(op.request.serverId);
    if (!net?.external_id || !server?.external_id) {
      throw cloudError(400, 'Network/server missing external id');
    }
    const out = await driver.attachServerToNetwork(
      net.external_id,
      server.external_id,
      op.request.opts || {}
    );
    return { action: out.action };
  });

  queue.registerHandler('network_detach_server', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const net = await getNetwork(op.resource_id);
    const server = await repo.getServer(op.request.serverId);
    if (!net?.external_id || !server?.external_id) {
      throw cloudError(400, 'Network/server missing external id');
    }
    const out = await driver.detachServerFromNetwork(
      net.external_id,
      server.external_id
    );
    return { action: out.action };
  });

  queue.registerHandler('network_add_route', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const net = await getNetwork(op.resource_id);
    if (!net?.external_id) throw cloudError(400, 'Network has no external id');
    const out = await driver.addNetworkRoute(net.external_id, op.request.route);
    return { action: out.action };
  });

  queue.registerHandler('create_primary_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createPrimaryIp(op.request.spec);
    await extras.updatePrimaryIp(op.resource_id, {
      external_id: out.primaryIp.externalId,
      ip: out.primaryIp.ip,
      status: 'available',
    });
    return { externalId: out.primaryIp.externalId, ip: out.primaryIp.ip };
  });

  queue.registerHandler('delete_primary_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getPrimaryIp(op.resource_id);
    if (row?.external_id) await driver.deletePrimaryIp(row.external_id);
    await extras.deletePrimaryIpRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('assign_primary_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getPrimaryIp(op.resource_id);
    const server = await repo.getServer(op.request.serverId);
    if (!row?.external_id || !server?.external_id) {
      throw cloudError(400, 'IP/server missing external id');
    }
    const out = await driver.assignPrimaryIp(row.external_id, server.external_id);
    await extras.updatePrimaryIp(row.id, { server_id: server.id, status: 'assigned' });
    return { action: out.action };
  });

  queue.registerHandler('unassign_primary_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getPrimaryIp(op.resource_id);
    if (!row?.external_id) throw cloudError(400, 'IP has no external id');
    const out = await driver.unassignPrimaryIp(row.external_id);
    await extras.updatePrimaryIp(row.id, { server_id: null, status: 'available' });
    return { action: out.action };
  });

  queue.registerHandler('create_floating_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createFloatingIp(op.request.spec);
    await extras.updateFloatingIp(op.resource_id, {
      external_id: out.floatingIp.externalId,
      ip: out.floatingIp.ip,
      status: 'available',
    });
    return { externalId: out.floatingIp.externalId, ip: out.floatingIp.ip };
  });

  queue.registerHandler('delete_floating_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getFloatingIp(op.resource_id);
    if (row?.external_id) await driver.deleteFloatingIp(row.external_id);
    await extras.deleteFloatingIpRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('assign_floating_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getFloatingIp(op.resource_id);
    const server = await repo.getServer(op.request.serverId);
    if (!row?.external_id || !server?.external_id) {
      throw cloudError(400, 'IP/server missing external id');
    }
    const out = await driver.assignFloatingIp(row.external_id, server.external_id);
    await extras.updateFloatingIp(row.id, {
      server_id: server.id,
      status: 'assigned',
    });
    return { action: out.action };
  });

  queue.registerHandler('unassign_floating_ip', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getFloatingIp(op.resource_id);
    if (!row?.external_id) throw cloudError(400, 'IP has no external id');
    const out = await driver.unassignFloatingIp(row.external_id);
    await extras.updateFloatingIp(row.id, { server_id: null, status: 'available' });
    return { action: out.action };
  });

  queue.registerHandler('set_reverse_dns', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    return driver.setReverseDns(op.request.ip, op.request.ptr);
  });

  queue.registerHandler('create_load_balancer', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createLoadBalancer(op.request.spec);
    await extras.updateLoadBalancer(op.resource_id, {
      external_id: out.loadBalancer.externalId,
      public_ipv4: out.loadBalancer.publicIpv4,
      status: 'available',
    });
    return { externalId: out.loadBalancer.externalId };
  });

  queue.registerHandler('delete_load_balancer', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getLoadBalancer(op.resource_id);
    if (row?.external_id) await driver.deleteLoadBalancer(row.external_id);
    await extras.deleteLoadBalancerRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('create_placement_group', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createPlacementGroup(op.request.spec);
    await extras.updatePlacementGroup(op.resource_id, {
      external_id: out.placementGroup.externalId,
      status: 'available',
    });
    return { externalId: out.placementGroup.externalId };
  });

  queue.registerHandler('delete_placement_group', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getPlacementGroup(op.resource_id);
    if (row?.external_id) await driver.deletePlacementGroup(row.external_id);
    await extras.deletePlacementGroupRow(op.resource_id);
    return { deleted: true };
  });

  queue.registerHandler('create_certificate', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createCertificate(op.request.spec);
    await extras.updateCertificate(op.resource_id, {
      external_id: out.certificate.externalId,
      status: 'available',
    });
    return { externalId: out.certificate.externalId };
  });

  queue.registerHandler('delete_certificate', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const row = await extras.getCertificate(op.resource_id);
    if (row?.external_id) await driver.deleteCertificate(row.external_id);
    await extras.deleteCertificateRow(op.resource_id);
    return { deleted: true };
  });

  // fix create_firewall / create_network / create_ssh_key external ids
  queue.registerHandler('create_firewall', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createFirewall(op.request.spec);
    const store = require('../store');
    if (!require('../db').isMetaReady()) {
      const fw = (store.cloudFirewalls || []).find((f) => f.id === op.resource_id);
      if (fw) fw.external_id = out.firewall.externalId;
    } else {
      await require('../db')
        .getMetaPool()
        .query(
          `UPDATE cloud_firewalls SET external_id = $1, status = 'active' WHERE id = $2`,
          [out.firewall.externalId, op.resource_id]
        );
    }
    return { resourceId: op.resource_id, externalId: out.firewall.externalId };
  });

  queue.registerHandler('create_network', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createNetwork(op.request.spec);
    const store = require('../store');
    if (!require('../db').isMetaReady()) {
      const net = (store.cloudNetworks || []).find((n) => n.id === op.resource_id);
      if (net) {
        net.external_id = out.network.externalId;
        net.status = 'available';
      }
    } else {
      await require('../db')
        .getMetaPool()
        .query(
          `UPDATE cloud_networks SET external_id = $1, status = 'available' WHERE id = $2`,
          [out.network.externalId, op.resource_id]
        );
    }
    return { resourceId: op.resource_id, externalId: out.network.externalId };
  });

  queue.registerHandler('create_ssh_key', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createSSHKey(op.request.spec);
    const store = require('../store');
    if (!require('../db').isMetaReady()) {
      const key = (store.cloudSshKeys || []).find((k) => k.id === op.resource_id);
      if (key) {
        key.external_id = out.sshKey.externalId;
        key.fingerprint = out.sshKey.fingerprint;
      }
    } else {
      await require('../db')
        .getMetaPool()
        .query(
          `UPDATE cloud_ssh_keys SET external_id = $1, fingerprint = $2 WHERE id = $3`,
          [out.sshKey.externalId, out.sshKey.fingerprint, op.resource_id]
        );
    }
    return {
      resourceId: op.resource_id,
      externalId: out.sshKey.externalId,
      fingerprint: out.sshKey.fingerprint,
    };
  });
}

function isMetaReadySafe() {
  try {
    return require('../db').isMetaReady();
  } catch {
    return false;
  }
}

async function getNetwork(id) {
  if (require('../db').isMetaReady()) {
    const { rows } = await require('../db')
      .getMetaPool()
      .query(`SELECT * FROM cloud_networks WHERE id = $1`, [id]);
    return rows[0] || null;
  }
  const store = require('../store');
  return (store.cloudNetworks || []).find((n) => n.id === id) || null;
}

async function deleteNetworkRow(id) {
  if (require('../db').isMetaReady()) {
    await require('../db')
      .getMetaPool()
      .query(`DELETE FROM cloud_networks WHERE id = $1`, [id]);
  } else {
    const store = require('../store');
    store.cloudNetworks = (store.cloudNetworks || []).filter((n) => n.id !== id);
  }
}

/**
 * Attach extended service methods onto CloudService object.
 */
function attachServiceMethods(CloudService, { enqueueAction, newId, resolveDriver }) {
  const SERVER_ACTIONS = [
    'reboot',
    'power_on',
    'power_off',
    'reset',
    'enable_rescue',
    'disable_rescue',
    'attach_iso',
    'detach_iso',
    'request_console',
    'enable_backup',
    'disable_backup',
    'change_protection',
  ];

  CloudService.serverAction = async function serverAction({
    tenantId,
    serverId,
    action,
    createdBy,
    body,
  }) {
    const server = await CloudService.getServer(tenantId, serverId);

    if (action === 'resize' || action === 'resize_server') {
      if (!body?.serverType) {
        throw cloudError(400, 'serverType required for resize', 'validation');
      }
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'resize_server',
        request: { serverType: body.serverType },
        createdBy,
      });
    }
    if (action === 'rebuild') {
      if (!body?.image) throw cloudError(400, 'image required for rebuild', 'validation');
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'rebuild',
        request: { image: body.image },
        createdBy,
      });
    }
    if (action === 'rename' || action === 'rename_server') {
      if (!body?.name) throw cloudError(400, 'name required', 'validation');
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'rename_server',
        request: { name: body.name },
        createdBy,
      });
    }
    if (action === 'labels' || action === 'update_labels') {
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'update_labels',
        request: { labels: body?.labels || {} },
        createdBy,
      });
    }
    if (action === 'attach_iso') {
      if (!body?.iso) throw cloudError(400, 'iso required', 'validation');
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'attach_iso',
        request: { args: [body.iso] },
        createdBy,
      });
    }
    if (action === 'change_protection') {
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'change_protection',
        request: { args: [{ delete: !!body?.delete, rebuild: !!body?.rebuild }] },
        createdBy,
      });
    }
    if (action === 'metrics') {
      const { driver } = await resolveDriver(server.provider_id);
      try {
        return { data: await driver.getServerMetrics(server.external_id, body || {}) };
      } catch (err) {
        throw cloudError(
          err.status || 501,
          err.message || 'Metrics coming soon',
          err.code || 'coming_soon'
        );
      }
    }
    if (action === 'console' || action === 'request_console') {
      return enqueueAction({
        tenantId,
        projectId: server.project_id,
        providerId: server.provider_id,
        resourceType: 'server',
        resourceId: server.id,
        action: 'request_console',
        request: {},
        createdBy,
      });
    }

    const mapped = action === 'power-on' ? 'power_on' : action === 'power-off' ? 'power_off' : action;
    if (!SERVER_ACTIONS.includes(mapped)) {
      throw cloudError(
        400,
        `Unsupported server action: ${action}`,
        'validation'
      );
    }
    return enqueueAction({
      tenantId,
      projectId: server.project_id,
      providerId: server.provider_id,
      resourceType: 'server',
      resourceId: server.id,
      action: mapped,
      request: { args: body?.args || [] },
      createdBy,
    });
  };

  CloudService.deleteVolume = async function deleteVolume({
    tenantId,
    volumeId,
    createdBy,
  }) {
    const volume = await repo.getVolume(volumeId);
    if (!volume || volume.tenant_id !== tenantId) {
      throw cloudError(404, 'Volume not found', 'not_found');
    }
    const op = await enqueueAction({
      tenantId,
      projectId: volume.project_id,
      providerId: volume.provider_id,
      resourceType: 'volume',
      resourceId: volume.id,
      action: 'delete_volume',
      request: {},
      createdBy,
    });
    await repo.updateVolume(volume.id, { status: 'deleting' });
    return { operation: op };
  };

  CloudService.resizeVolume = async function resizeVolume({
    tenantId,
    volumeId,
    sizeGb,
    createdBy,
  }) {
    const volume = await repo.getVolume(volumeId);
    if (!volume || volume.tenant_id !== tenantId) {
      throw cloudError(404, 'Volume not found', 'not_found');
    }
    if (!sizeGb || sizeGb <= volume.size_gb) {
      throw cloudError(400, 'sizeGb must be greater than current size', 'validation');
    }
    return enqueueAction({
      tenantId,
      projectId: volume.project_id,
      providerId: volume.provider_id,
      resourceType: 'volume',
      resourceId: volume.id,
      action: 'resize_volume',
      request: { sizeGb },
      createdBy,
    }).then(async (operation) => {
      await repo.updateVolume(volume.id, { status: 'resizing' });
      return { operation };
    });
  };

  CloudService.deleteFirewall = async function deleteFirewall({
    tenantId,
    firewallId,
    createdBy,
  }) {
    const fw = await repo.getFirewall(firewallId);
    if (!fw || fw.tenant_id !== tenantId) {
      throw cloudError(404, 'Firewall not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: fw.project_id,
        providerId: fw.provider_id,
        resourceType: 'firewall',
        resourceId: fw.id,
        action: 'delete_firewall',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.setFirewallRules = async function setFirewallRules({
    tenantId,
    firewallId,
    rules,
    createdBy,
  }) {
    const fw = await repo.getFirewall(firewallId);
    if (!fw || fw.tenant_id !== tenantId) {
      throw cloudError(404, 'Firewall not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: fw.project_id,
        providerId: fw.provider_id,
        resourceType: 'firewall',
        resourceId: fw.id,
        action: 'set_firewall_rules',
        request: { rules: rules || [] },
        createdBy,
      }),
    };
  };

  CloudService.applyFirewall = async function applyFirewall({
    tenantId,
    firewallId,
    serverIds,
    createdBy,
  }) {
    const fw = await repo.getFirewall(firewallId);
    if (!fw || fw.tenant_id !== tenantId) {
      throw cloudError(404, 'Firewall not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: fw.project_id,
        providerId: fw.provider_id,
        resourceType: 'firewall',
        resourceId: fw.id,
        action: 'apply_firewall',
        request: { serverIds: serverIds || [] },
        createdBy,
      }),
    };
  };

  CloudService.deleteSnapshot = async function deleteSnapshot({
    tenantId,
    snapshotId,
    createdBy,
  }) {
    const snap = await repo.getSnapshot(snapshotId);
    if (!snap || snap.tenant_id !== tenantId) {
      throw cloudError(404, 'Snapshot not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: snap.project_id,
        providerId: snap.provider_id,
        resourceType: 'snapshot',
        resourceId: snap.id,
        action: 'delete_snapshot',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.deleteSshKey = async function deleteSshKey({
    tenantId,
    keyId,
    createdBy,
  }) {
    const key = await repo.getSshKey(keyId);
    if (!key || key.tenant_id !== tenantId) {
      throw cloudError(404, 'SSH key not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: key.project_id,
        providerId: key.provider_id,
        resourceType: 'ssh_key',
        resourceId: key.id,
        action: 'delete_ssh_key',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.deleteNetwork = async function deleteNetwork({
    tenantId,
    networkId,
    createdBy,
  }) {
    const net = await getNetwork(networkId);
    if (!net || net.tenant_id !== tenantId) {
      throw cloudError(404, 'Network not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: net.project_id,
        providerId: net.provider_id,
        resourceType: 'network',
        resourceId: net.id,
        action: 'delete_network',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.networkAction = async function networkAction({
    tenantId,
    networkId,
    action,
    body,
    createdBy,
  }) {
    const net = await getNetwork(networkId);
    if (!net || net.tenant_id !== tenantId) {
      throw cloudError(404, 'Network not found', 'not_found');
    }
    const map = {
      'add-subnet': 'network_add_subnet',
      attach: 'network_attach_server',
      detach: 'network_detach_server',
      'add-route': 'network_add_route',
    };
    const opAction = map[action];
    if (!opAction) throw cloudError(400, 'Unknown network action', 'validation');
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: net.project_id,
        providerId: net.provider_id,
        resourceType: 'network',
        resourceId: net.id,
        action: opAction,
        request: {
          subnet: body?.subnet,
          serverId: body?.serverId,
          opts: body?.opts,
          route: body?.route,
        },
        createdBy,
      }),
    };
  };

  // --- Primary / Floating IPs ---
  CloudService.createPrimaryIp = async function createPrimaryIp(opts) {
    const row = await extras.insertPrimaryIp({
      id: newId('cip'),
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      name: opts.name,
      type: opts.type || 'ipv4',
      status: 'pending',
      createdBy: opts.createdBy,
    });
    const op = await enqueueAction({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      resourceType: 'primary_ip',
      resourceId: row.id,
      action: 'create_primary_ip',
      request: {
        spec: {
          name: opts.name,
          type: opts.type || 'ipv4',
          datacenter: opts.datacenter,
          serverExternalId: opts.serverExternalId,
        },
      },
      createdBy: opts.createdBy,
    });
    return { primaryIp: row, operation: op };
  };
  CloudService.listPrimaryIps = (t) => extras.listPrimaryIps(t);
  CloudService.deletePrimaryIp = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getPrimaryIp(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Primary IP not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'primary_ip',
        resourceId: row.id,
        action: 'delete_primary_ip',
        request: {},
        createdBy,
      }),
    };
  };
  CloudService.assignPrimaryIp = async ({ tenantId, id, serverId, createdBy }) => {
    const row = await extras.getPrimaryIp(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Primary IP not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'primary_ip',
        resourceId: row.id,
        action: 'assign_primary_ip',
        request: { serverId },
        createdBy,
      }),
    };
  };
  CloudService.unassignPrimaryIp = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getPrimaryIp(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Primary IP not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'primary_ip',
        resourceId: row.id,
        action: 'unassign_primary_ip',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.createFloatingIp = async function createFloatingIp(opts) {
    const row = await extras.insertFloatingIp({
      id: newId('cfip'),
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      name: opts.name,
      type: opts.type || 'ipv4',
      location: opts.location,
      status: 'pending',
      createdBy: opts.createdBy,
    });
    const op = await enqueueAction({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      resourceType: 'floating_ip',
      resourceId: row.id,
      action: 'create_floating_ip',
      request: {
        spec: {
          name: opts.name,
          type: opts.type || 'ipv4',
          location: opts.location,
        },
      },
      createdBy: opts.createdBy,
    });
    return { floatingIp: row, operation: op };
  };
  CloudService.listFloatingIps = (t) => extras.listFloatingIps(t);
  CloudService.deleteFloatingIp = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getFloatingIp(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Floating IP not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'floating_ip',
        resourceId: row.id,
        action: 'delete_floating_ip',
        request: {},
        createdBy,
      }),
    };
  };
  CloudService.assignFloatingIp = async ({ tenantId, id, serverId, createdBy }) => {
    const row = await extras.getFloatingIp(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Floating IP not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'floating_ip',
        resourceId: row.id,
        action: 'assign_floating_ip',
        request: { serverId },
        createdBy,
      }),
    };
  };
  CloudService.unassignFloatingIp = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getFloatingIp(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Floating IP not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'floating_ip',
        resourceId: row.id,
        action: 'unassign_floating_ip',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.setReverseDns = async function setReverseDns({
    tenantId,
    providerId,
    ip,
    ptr,
    createdBy,
    projectId,
  }) {
    if (!providerId || !ip || !ptr) {
      throw cloudError(400, 'providerId, ip, ptr required', 'validation');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId,
        providerId,
        resourceType: 'dns',
        resourceId: null,
        action: 'set_reverse_dns',
        request: { ip, ptr },
        createdBy,
      }),
    };
  };

  CloudService.createLoadBalancer = async function createLoadBalancer(opts) {
    const row = await extras.insertLoadBalancer({
      id: newId('clb'),
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      name: opts.name,
      lbType: opts.type || 'lb11',
      location: opts.location,
      status: 'pending',
      createdBy: opts.createdBy,
    });
    const op = await enqueueAction({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      resourceType: 'load_balancer',
      resourceId: row.id,
      action: 'create_load_balancer',
      request: {
        spec: {
          name: opts.name,
          type: opts.type || 'lb11',
          location: opts.location,
          services: opts.services,
          targets: opts.targets,
        },
      },
      createdBy: opts.createdBy,
    });
    return { loadBalancer: row, operation: op };
  };
  CloudService.listLoadBalancers = (t) => extras.listLoadBalancers(t);
  CloudService.deleteLoadBalancer = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getLoadBalancer(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Load balancer not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'load_balancer',
        resourceId: row.id,
        action: 'delete_load_balancer',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.createPlacementGroup = async function createPlacementGroup(opts) {
    const row = await extras.insertPlacementGroup({
      id: newId('cpg'),
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      name: opts.name,
      pgType: opts.type || 'spread',
      status: 'pending',
      createdBy: opts.createdBy,
    });
    const op = await enqueueAction({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      resourceType: 'placement_group',
      resourceId: row.id,
      action: 'create_placement_group',
      request: { spec: { name: opts.name, type: opts.type || 'spread' } },
      createdBy: opts.createdBy,
    });
    return { placementGroup: row, operation: op };
  };
  CloudService.listPlacementGroups = (t) => extras.listPlacementGroups(t);
  CloudService.deletePlacementGroup = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getPlacementGroup(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Placement group not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'placement_group',
        resourceId: row.id,
        action: 'delete_placement_group',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.createCertificate = async function createCertificate(opts) {
    const row = await extras.insertCertificate({
      id: newId('ccert'),
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      name: opts.name,
      certType: opts.type || 'uploaded',
      domainNames: opts.domainNames || [],
      status: 'pending',
      createdBy: opts.createdBy,
    });
    const op = await enqueueAction({
      tenantId: opts.tenantId,
      projectId: opts.projectId,
      providerId: opts.providerId,
      resourceType: 'certificate',
      resourceId: row.id,
      action: 'create_certificate',
      request: {
        spec: {
          name: opts.name,
          type: opts.type || 'uploaded',
          certificate: opts.certificate,
          privateKey: opts.privateKey,
          domainNames: opts.domainNames,
        },
      },
      createdBy: opts.createdBy,
    });
    return { certificate: row, operation: op };
  };
  CloudService.listCertificates = (t) => extras.listCertificates(t);
  CloudService.deleteCertificate = async ({ tenantId, id, createdBy }) => {
    const row = await extras.getCertificate(id);
    if (!row || row.tenant_id !== tenantId) {
      throw cloudError(404, 'Certificate not found', 'not_found');
    }
    return {
      operation: await enqueueAction({
        tenantId,
        projectId: row.project_id,
        providerId: row.provider_id,
        resourceType: 'certificate',
        resourceId: row.id,
        action: 'delete_certificate',
        request: {},
        createdBy,
      }),
    };
  };

  CloudService.capabilityMatrix = function capabilityMatrix() {
    return require('./parity').MATRIX;
  };
}

module.exports = { wireExtraHandlers, attachServiceMethods };
