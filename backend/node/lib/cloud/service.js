/**
 * CloudService — orchestration only. Resolves provider via factory from slug.
 * Never imports Hetzner (or any vendor) directly.
 */
const store = require('../store');
const repo = require('./repository');
const queue = require('./queue');
const { createProviderFromRow, listSupportedSlugs } = require('./factory');
const { cloudError } = require('./errors');

function newId(prefix) {
  return store.newId(prefix);
}

async function resolveDriver(providerId) {
  const row = await repo.getProvider(providerId);
  if (!row) throw cloudError(404, 'Provider not found', 'not_found');
  const key = await repo.getProviderDecryptedKey(row);
  return { row, driver: createProviderFromRow(row, { decryptedApiKey: key }) };
}

/** Wire queue handlers once (idempotent). */
let handlersWired = false;
function ensureHandlers() {
  if (handlersWired) return;
  handlersWired = true;

  queue.registerHandler('create_server', async (op) => {
    const req = op.request || {};
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createServer(req.spec);
    await repo.updateServer(op.resource_id, {
      externalId: out.server.externalId,
      status: out.server.status || 'running',
      ipv4: out.server.ipv4,
      ipv6: out.server.ipv6,
      metadata: {
        rootPasswordSet: Boolean(out.rootPassword),
        providerAction: out.action,
      },
    });
    return {
      resourceId: op.resource_id,
      externalId: out.server.externalId,
      action: out.action,
    };
  });

  queue.registerHandler('delete_server', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (server?.external_id) {
      await driver.deleteServer(server.external_id);
    }
    await repo.deleteServerRow(op.resource_id);
    return { resourceId: op.resource_id, deleted: true };
  });

  queue.registerHandler('power_on', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.powerOn(server.external_id);
    await repo.updateServer(op.resource_id, { status: 'running' });
    return { action: out.action };
  });

  queue.registerHandler('power_off', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.powerOff(server.external_id);
    await repo.updateServer(op.resource_id, { status: 'off' });
    return { action: out.action };
  });

  queue.registerHandler('reboot', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.resource_id);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.reboot(server.external_id);
    return { action: out.action };
  });

  queue.registerHandler('create_volume', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createVolume(op.request.spec);
    await repo.updateVolume(op.resource_id, {
      externalId: out.volume.externalId,
      status: out.volume.status || 'available',
    });
    return { resourceId: op.resource_id, externalId: out.volume.externalId };
  });

  queue.registerHandler('create_firewall', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createFirewall(op.request.spec);
    const fw = await repo.getFirewall(op.resource_id);
    if (fw) {
      // update via re-insert pattern: store external on metadata for mem
      if (fw.external_id === null || fw.external_id === undefined) {
        fw.external_id = out.firewall.externalId;
      }
    }
    return { resourceId: op.resource_id, externalId: out.firewall.externalId };
  });

  queue.registerHandler('create_snapshot', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const server = await repo.getServer(op.request.serverId);
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.createSnapshot(
      server.external_id,
      op.request.name
    );
    await repo.updateSnapshot(op.resource_id, {
      externalId: out.image?.externalId || null,
      status: 'available',
      metadata: { action: out.action },
    });
    return { resourceId: op.resource_id, externalId: out.image?.externalId };
  });

  queue.registerHandler('create_ssh_key', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createSSHKey(op.request.spec);
    return {
      resourceId: op.resource_id,
      externalId: out.sshKey.externalId,
      fingerprint: out.sshKey.fingerprint,
    };
  });

  queue.registerHandler('create_network', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const out = await driver.createNetwork(op.request.spec);
    return { resourceId: op.resource_id, externalId: out.network.externalId };
  });

  queue.registerHandler('attach_volume', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const volume = await repo.getVolume(op.resource_id);
    const server = await repo.getServer(op.request.serverId);
    if (!volume?.external_id) throw cloudError(400, 'Volume has no external id');
    if (!server?.external_id) throw cloudError(400, 'Server has no external id');
    const out = await driver.attachVolume(volume.external_id, server.external_id);
    await repo.updateVolume(volume.id, {
      serverId: server.id,
      status: 'attached',
    });
    return { action: out.action, serverId: server.id };
  });

  queue.registerHandler('detach_volume', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const volume = await repo.getVolume(op.resource_id);
    if (!volume?.external_id) throw cloudError(400, 'Volume has no external id');
    const out = await driver.detachVolume(volume.external_id);
    await repo.updateVolume(volume.id, {
      serverId: null,
      status: 'available',
    });
    return { action: out.action };
  });

  queue.registerHandler('restore_snapshot', async (op) => {
    const { driver } = await resolveDriver(op.provider_id);
    const snap = await repo.getSnapshot(op.resource_id);
    if (!snap?.external_id) throw cloudError(400, 'Snapshot has no external id');
    const spec = op.request.spec || {};
    const out = await driver.restoreSnapshot(snap.external_id, spec);
    const server = await repo.insertServer({
      id: newId('csrv'),
      tenantId: op.tenant_id,
      projectId: op.project_id,
      providerId: op.provider_id,
      name: spec.name || `restore-${Date.now()}`,
      status: out.server?.status || 'running',
      serverType: spec.serverType,
      image: snap.external_id,
      location: spec.location,
      ipv4: out.server?.ipv4,
      ipv6: out.server?.ipv6,
      createdBy: op.created_by,
    });
    if (out.server?.externalId) {
      await repo.updateServer(server.id, {
        externalId: out.server.externalId,
        status: out.server.status || 'running',
        ipv4: out.server.ipv4,
        ipv6: out.server.ipv6,
      });
    }
    return {
      resourceId: server.id,
      externalId: out.server?.externalId,
      action: out.action,
    };
  });
}

ensureHandlers();

async function enqueueAction({
  tenantId,
  projectId,
  providerId,
  resourceType,
  resourceId,
  action,
  request,
  createdBy,
}) {
  const op = await repo.insertOperation({
    id: newId('cop'),
    tenantId,
    projectId,
    providerId,
    resourceType,
    resourceId,
    action,
    status: 'pending',
    request: request || {},
    createdBy,
  });
  await queue.enqueue(op.id);
  return op;
}

const CloudService = {
  supportedSlugs() {
    return listSupportedSlugs();
  },

  async createProvider({ tenantId, projectId, name, slug, apiKey, config, createdBy }) {
    if (!name || !slug) {
      throw cloudError(400, 'name and slug are required', 'validation');
    }
    const allowed = listSupportedSlugs();
    if (!allowed.includes(String(slug).toLowerCase())) {
      throw cloudError(
        400,
        `slug must be one of: ${allowed.join(', ')}`,
        'validation'
      );
    }
    return repo.insertProvider({
      id: newId('cprv'),
      tenantId,
      projectId,
      name,
      slug: String(slug).toLowerCase(),
      apiKey,
      config,
      createdBy,
    });
  },

  listProviders(tenantId) {
    return repo.listProviders(tenantId);
  },

  async createServer({
    tenantId,
    projectId,
    providerId,
    name,
    serverType,
    image,
    location,
    sshKeys,
    userData,
    enableIpv4,
    enableIpv6,
    labels,
    networks,
    placementGroup,
    firewalls,
    createdBy,
  }) {
    if (!providerId || !name || !serverType || !image || !location) {
      throw cloudError(
        400,
        'providerId, name, serverType, image, location required',
        'validation'
      );
    }
    await resolveDriver(providerId);
    const quote = require('./catalog/enrich').quoteServerType(serverType);
    const server = await repo.insertServer({
      id: newId('csrv'),
      tenantId,
      projectId,
      providerId,
      name,
      status: 'pending',
      serverType,
      image,
      location,
      labels,
      userData,
      costProvider: quote?.costProviderMonthly ?? null,
      priceRetail: quote?.priceRetailMonthly ?? null,
      currency: quote?.currency || 'EUR',
      createdBy,
    });
    const op = await enqueueAction({
      tenantId,
      projectId,
      providerId,
      resourceType: 'server',
      resourceId: server.id,
      action: 'create_server',
      request: {
        spec: {
          name,
          serverType,
          image,
          location,
          sshKeys,
          userData,
          enableIpv4,
          enableIpv6,
          labels,
          networks,
          placementGroup,
          firewalls,
        },
      },
      createdBy,
    });
    return { server, operation: op };
  },

  listServers(tenantId, opts) {
    return repo.listServers(tenantId, opts);
  },

  async getServer(tenantId, id) {
    const s = await repo.getServer(id);
    if (!s || s.tenant_id !== tenantId) {
      throw cloudError(404, 'Server not found', 'not_found');
    }
    return s;
  },

  async deleteServer({ tenantId, serverId, createdBy }) {
    const server = await this.getServer(tenantId, serverId);
    const op = await enqueueAction({
      tenantId,
      projectId: server.project_id,
      providerId: server.provider_id,
      resourceType: 'server',
      resourceId: server.id,
      action: 'delete_server',
      request: {},
      createdBy,
    });
    await repo.updateServer(server.id, { status: 'deleting' });
    return { operation: op };
  },

  async serverAction({ tenantId, serverId, action, createdBy }) {
    const allowed = ['reboot', 'power_on', 'power_off'];
    if (!allowed.includes(action)) {
      throw cloudError(400, `action must be one of ${allowed.join(', ')}`, 'validation');
    }
    const server = await this.getServer(tenantId, serverId);
    return enqueueAction({
      tenantId,
      projectId: server.project_id,
      providerId: server.provider_id,
      resourceType: 'server',
      resourceId: server.id,
      action,
      request: {},
      createdBy,
    });
  },

  async createVolume({
    tenantId,
    projectId,
    providerId,
    name,
    sizeGb,
    location,
    serverId,
    createdBy,
  }) {
    if (!providerId || !name || !location) {
      throw cloudError(400, 'providerId, name, location required', 'validation');
    }
    let serverExternalId;
    if (serverId) {
      const s = await this.getServer(tenantId, serverId);
      serverExternalId = s.external_id;
    }
    const volume = await repo.insertVolume({
      id: newId('cvol'),
      tenantId,
      projectId,
      providerId,
      serverId: serverId || null,
      name,
      sizeGb: sizeGb || 10,
      location,
      status: 'pending',
      createdBy,
    });
    const op = await enqueueAction({
      tenantId,
      projectId,
      providerId,
      resourceType: 'volume',
      resourceId: volume.id,
      action: 'create_volume',
      request: {
        spec: {
          name,
          sizeGb: sizeGb || 10,
          location,
          serverExternalId,
        },
      },
      createdBy,
    });
    return { volume, operation: op };
  },

  listVolumes(tenantId) {
    return repo.listVolumes(tenantId);
  },

  async attachVolume({ tenantId, volumeId, serverId, createdBy }) {
    const volume = await repo.getVolume(volumeId);
    if (!volume || volume.tenant_id !== tenantId) {
      throw cloudError(404, 'Volume not found', 'not_found');
    }
    await this.getServer(tenantId, serverId);
    return enqueueAction({
      tenantId,
      projectId: volume.project_id,
      providerId: volume.provider_id,
      resourceType: 'volume',
      resourceId: volume.id,
      action: 'attach_volume',
      request: { serverId },
      createdBy,
    }).then(async (operation) => {
      await repo.updateVolume(volume.id, { status: 'attaching' });
      return { operation };
    });
  },

  async detachVolume({ tenantId, volumeId, createdBy }) {
    const volume = await repo.getVolume(volumeId);
    if (!volume || volume.tenant_id !== tenantId) {
      throw cloudError(404, 'Volume not found', 'not_found');
    }
    return enqueueAction({
      tenantId,
      projectId: volume.project_id,
      providerId: volume.provider_id,
      resourceType: 'volume',
      resourceId: volume.id,
      action: 'detach_volume',
      request: {},
      createdBy,
    }).then(async (operation) => {
      await repo.updateVolume(volume.id, { status: 'detaching' });
      return { operation };
    });
  },

  async createFirewall({ tenantId, projectId, providerId, name, rules, createdBy }) {
    if (!providerId || !name) {
      throw cloudError(400, 'providerId and name required', 'validation');
    }
    const fw = await repo.insertFirewall({
      id: newId('cfw'),
      tenantId,
      projectId,
      providerId,
      name,
      rules: rules || [],
      status: 'pending',
      createdBy,
    });
    const op = await enqueueAction({
      tenantId,
      projectId,
      providerId,
      resourceType: 'firewall',
      resourceId: fw.id,
      action: 'create_firewall',
      request: { spec: { name, rules: rules || [] } },
      createdBy,
    });
    return { firewall: fw, operation: op };
  },

  listFirewalls(tenantId) {
    return repo.listFirewalls(tenantId);
  },

  async createSnapshot({ tenantId, serverId, name, createdBy }) {
    const server = await this.getServer(tenantId, serverId);
    const snap = await repo.insertSnapshot({
      id: newId('csnp'),
      tenantId,
      projectId: server.project_id,
      providerId: server.provider_id,
      serverId: server.id,
      name: name || `snapshot-${Date.now()}`,
      status: 'pending',
      createdBy,
    });
    const op = await enqueueAction({
      tenantId,
      projectId: server.project_id,
      providerId: server.provider_id,
      resourceType: 'snapshot',
      resourceId: snap.id,
      action: 'create_snapshot',
      request: { serverId: server.id, name: snap.name },
      createdBy,
    });
    return { snapshot: snap, operation: op };
  },

  listSnapshots(tenantId) {
    return repo.listSnapshots(tenantId);
  },

  async restoreSnapshot({
    tenantId,
    snapshotId,
    name,
    serverType,
    location,
    sshKeys,
    userData,
    createdBy,
  }) {
    const snap = await repo.getSnapshot(snapshotId);
    if (!snap || snap.tenant_id !== tenantId) {
      throw cloudError(404, 'Snapshot not found', 'not_found');
    }
    if (!name || !serverType || !location) {
      throw cloudError(400, 'name, serverType, location required', 'validation');
    }
    const operation = await enqueueAction({
      tenantId,
      projectId: snap.project_id,
      providerId: snap.provider_id,
      resourceType: 'snapshot',
      resourceId: snap.id,
      action: 'restore_snapshot',
      request: {
        spec: {
          name,
          serverType,
          location,
          sshKeys,
          userData,
          enableIpv4: true,
          enableIpv6: true,
        },
      },
      createdBy,
    });
    return { operation };
  },

  async createSshKey({
    tenantId,
    projectId,
    providerId,
    name,
    publicKey,
    createdBy,
  }) {
    if (!providerId || !name || !publicKey) {
      throw cloudError(400, 'providerId, name, publicKey required', 'validation');
    }
    const { driver } = await resolveDriver(providerId);
    // SSH keys are usually sync — still record operation for activity log
    const row = await repo.insertSshKey({
      id: newId('cssh'),
      tenantId,
      projectId,
      providerId,
      name,
      publicKey,
      status: 'pending',
      createdBy,
    });
    const out = await driver.createSSHKey({ name, publicKey });
    // patch mem row
    row.external_id = out.sshKey.externalId;
    row.fingerprint = out.sshKey.fingerprint;
    const op = await repo.insertOperation({
      id: newId('cop'),
      tenantId,
      projectId,
      providerId,
      resourceType: 'ssh_key',
      resourceId: row.id,
      action: 'create_ssh_key',
      status: 'completed',
      request: { spec: { name } },
      result: { externalId: out.sshKey.externalId },
      createdBy,
    });
    return { sshKey: row, operation: op };
  },

  listSshKeys(tenantId) {
    return repo.listSshKeys(tenantId);
  },

  async createNetwork({
    tenantId,
    projectId,
    providerId,
    name,
    ipRange,
    createdBy,
  }) {
    if (!providerId || !name) {
      throw cloudError(400, 'providerId and name required', 'validation');
    }
    const net = await repo.insertNetwork({
      id: newId('cnet'),
      tenantId,
      projectId,
      providerId,
      name,
      ipRange,
      status: 'pending',
      createdBy,
    });
    const op = await enqueueAction({
      tenantId,
      projectId,
      providerId,
      resourceType: 'network',
      resourceId: net.id,
      action: 'create_network',
      request: { spec: { name, ipRange } },
      createdBy,
    });
    return { network: net, operation: op };
  },

  listNetworks(tenantId) {
    return repo.listNetworks(tenantId);
  },

  async catalog(providerId, kind) {
    const { enrichServerTypes, enrichLocations } = require('./catalog/enrich');
    const {
      getSeedServerTypes,
      getSeedLocations,
      getPublicCatalog,
    } = require('./catalog');
    if (!providerId || providerId === 'seed' || providerId === 'public') {
      if (kind === 'server-types') return getSeedServerTypes();
      if (kind === 'locations' || kind === 'regions') return getSeedLocations();
      if (kind === 'public') return getPublicCatalog();
      throw cloudError(400, `Unknown catalog kind: ${kind}`, 'validation');
    }
    const { driver } = await resolveDriver(providerId);
    switch (kind) {
      case 'images':
        return driver.listImages();
      case 'locations':
      case 'regions': {
        try {
          return enrichLocations(await driver.listLocations());
        } catch {
          return getSeedLocations();
        }
      }
      case 'server-types': {
        try {
          return enrichServerTypes(await driver.listServerTypes());
        } catch {
          return getSeedServerTypes();
        }
      }
      case 'ssh-keys':
        return driver.listSSHKeys();
      default:
        throw cloudError(400, `Unknown catalog kind: ${kind}`, 'validation');
    }
  },

  publicCatalog() {
    return require('./catalog').getPublicCatalog();
  },

  quoteServerType(serverType) {
    return require('./catalog/enrich').quoteServerType(serverType);
  },

  getOperation(id) {
    return repo.getOperation(id);
  },

  listOperations(tenantId, opts) {
    return repo.listOperations(tenantId, opts);
  },
};

module.exports = { CloudService, ensureHandlers, resolveDriver };
