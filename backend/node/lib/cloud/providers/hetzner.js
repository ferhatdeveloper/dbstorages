/**
 * Hetzner Cloud API driver.
 * Official REST: https://docs.hetzner.cloud/reference/cloud
 * Only this module may mention Hetzner / api.hetzner.cloud.
 */
const axios = require('axios');
const { CloudProvider } = require('../providerInterface');
const { withRetry, cloudError } = require('../errors');

const DEFAULT_BASE = 'https://api.hetzner.cloud/v1';

const OS_IMAGE_HINTS = [
  'ubuntu',
  'debian',
  'alma',
  'rocky',
  'fedora',
  'centos',
  'windows',
];

function detectOsFamily(name, description, osFlavor) {
  const blob = `${name || ''} ${description || ''} ${osFlavor || ''}`.toLowerCase();
  if (blob.includes('windows') || osFlavor === 'windows') return 'windows';
  return 'linux';
}

class HetznerProvider extends CloudProvider {
  /**
   * @param {{ apiToken?: string, baseUrl?: string, fetchImpl?: Function }} opts
   */
  constructor(opts = {}) {
    super();
    this.apiToken =
      opts.apiToken || process.env.HETZNER_API_TOKEN || '';
    this.baseUrl = (opts.baseUrl || DEFAULT_BASE).replace(/\/$/, '');
    this._axios =
      opts.client ||
      axios.create({
        baseURL: this.baseUrl,
        timeout: Number(process.env.CLOUD_HTTP_TIMEOUT_MS || 30000),
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      });
  }

  async _request(method, path, data) {
    if (!this.apiToken) {
      throw cloudError(503, 'Cloud provider API token not configured', 'provider_unconfigured');
    }
    return withRetry(async () => {
      try {
        const res = await this._axios.request({ method, url: path, data });
        return res.data;
      } catch (err) {
        const status = err.response?.status || 502;
        const msg =
          err.response?.data?.error?.message ||
          err.message ||
          'Provider API error';
        // Never log token
        const wrapped = cloudError(status, msg, 'provider_api');
        wrapped.response = { status };
        throw wrapped;
      }
    });
  }

  _mapServer(s) {
    if (!s) return null;
    const ipv4 =
      s.public_net?.ipv4?.ip ||
      (s.public_net?.ipv4?.blocked === false ? s.public_net?.ipv4?.ip : null) ||
      null;
    const ipv6 = s.public_net?.ipv6?.ip || null;
    return {
      externalId: String(s.id),
      name: s.name,
      status: s.status,
      serverType: s.server_type?.name || null,
      image: s.image?.name || s.image?.description || null,
      location: s.datacenter?.location?.name || null,
      ipv4,
      ipv6,
      labels: s.labels || {},
      raw: s,
    };
  }

  async createServer(spec) {
    const body = {
      name: spec.name,
      server_type: spec.serverType,
      image: spec.image,
      location: spec.location,
      start_after_create: spec.startAfterCreate !== false,
      ssh_keys: spec.sshKeys || [],
      user_data: spec.userData || undefined,
      labels: spec.labels || {},
      networks: spec.networks || undefined,
      placement_group: spec.placementGroup
        ? Number(spec.placementGroup)
        : undefined,
      firewalls: (spec.firewalls || []).map((id) => ({ firewall: Number(id) })),
      public_net: {
        enable_ipv4: spec.enableIpv4 !== false,
        enable_ipv6: spec.enableIpv6 !== false,
      },
    };
    const data = await this._request('POST', '/servers', body);
    return {
      server: this._mapServer(data.server),
      action: data.action
        ? { id: String(data.action.id), status: data.action.status }
        : null,
      rootPassword: data.root_password || null,
    };
  }

  async deleteServer(externalId) {
    await this._request('DELETE', `/servers/${externalId}`);
    return { ok: true };
  }

  async powerOn(externalId) {
    const data = await this._request('POST', `/servers/${externalId}/actions/poweron`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async powerOff(externalId) {
    const data = await this._request('POST', `/servers/${externalId}/actions/poweroff`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async reboot(externalId) {
    const data = await this._request('POST', `/servers/${externalId}/actions/reboot`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async resize(externalId, serverType) {
    const data = await this._request('POST', `/servers/${externalId}/actions/change_type`, {
      server_type: serverType,
      upgrade_disk: true,
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async createVolume(spec) {
    const data = await this._request('POST', '/volumes', {
      name: spec.name,
      size: spec.sizeGb || spec.size || 10,
      location: spec.location,
      format: spec.format || 'ext4',
      automount: !!spec.automount,
      server: spec.serverExternalId ? Number(spec.serverExternalId) : undefined,
      labels: spec.labels || {},
    });
    return {
      volume: {
        externalId: String(data.volume.id),
        name: data.volume.name,
        sizeGb: data.volume.size,
        location: data.volume.location?.name,
        status: data.volume.status,
      },
      action: data.action
        ? { id: String(data.action.id), status: data.action.status }
        : null,
    };
  }

  async attachVolume(volumeId, serverId) {
    const data = await this._request('POST', `/volumes/${volumeId}/actions/attach`, {
      server: Number(serverId),
      automount: false,
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async detachVolume(volumeId) {
    const data = await this._request('POST', `/volumes/${volumeId}/actions/detach`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async deleteVolume(externalId) {
    await this._request('DELETE', `/volumes/${externalId}`);
    return { ok: true };
  }

  async createFirewall(spec) {
    const data = await this._request('POST', '/firewalls', {
      name: spec.name,
      rules: spec.rules || [],
      labels: spec.labels || {},
    });
    return {
      firewall: {
        externalId: String(data.firewall.id),
        name: data.firewall.name,
        rules: data.firewall.rules || [],
      },
    };
  }

  async deleteFirewall(externalId) {
    await this._request('DELETE', `/firewalls/${externalId}`);
    return { ok: true };
  }

  async createSnapshot(serverId, name) {
    const data = await this._request('POST', `/servers/${serverId}/actions/create_image`, {
      description: name || `snapshot-${Date.now()}`,
      type: 'snapshot',
    });
    return {
      action: { id: String(data.action.id), status: data.action.status },
      image: data.image
        ? { externalId: String(data.image.id), name: data.image.description }
        : null,
    };
  }

  async restoreSnapshot(snapshotId, spec) {
    // Create a new server from snapshot image id
    return this.createServer({
      ...spec,
      image: snapshotId,
    });
  }

  async deleteSnapshot(externalId) {
    await this._request('DELETE', `/images/${externalId}`);
    return { ok: true };
  }

  async listImages() {
    const data = await this._request('GET', '/images?type=system&per_page=50');
    const images = (data.images || [])
      .filter((img) => {
        const n = `${img.name || ''} ${img.description || ''} ${img.os_flavor || ''}`.toLowerCase();
        return OS_IMAGE_HINTS.some((h) => n.includes(h));
      })
      .map((img) => ({
        id: String(img.id),
        name: img.name,
        description: img.description,
        osFlavor: img.os_flavor,
        osFamily: detectOsFamily(img.name, img.description, img.os_flavor),
        architecture: img.architecture,
      }));
    return images;
  }

  async listLocations() {
    const data = await this._request('GET', '/locations');
    return (data.locations || []).map((l) => ({
      id: String(l.id),
      name: l.name,
      description: l.description,
      country: l.country,
      city: l.city,
    }));
  }

  async listServerTypes() {
    const data = await this._request('GET', '/server_types');
    return (data.server_types || []).map((t) => ({
      id: String(t.id),
      name: t.name,
      description: t.description,
      cores: t.cores,
      memory: t.memory,
      disk: t.disk,
      prices: t.prices,
    }));
  }

  async listSSHKeys() {
    const data = await this._request('GET', '/ssh_keys');
    return (data.ssh_keys || []).map((k) => ({
      id: String(k.id),
      name: k.name,
      fingerprint: k.fingerprint,
      publicKey: k.public_key,
    }));
  }

  async createSSHKey(spec) {
    const data = await this._request('POST', '/ssh_keys', {
      name: spec.name,
      public_key: spec.publicKey,
      labels: spec.labels || {},
    });
    return {
      sshKey: {
        externalId: String(data.ssh_key.id),
        name: data.ssh_key.name,
        fingerprint: data.ssh_key.fingerprint,
        publicKey: data.ssh_key.public_key,
      },
    };
  }

  async deleteSSHKey(externalId) {
    await this._request('DELETE', `/ssh_keys/${externalId}`);
    return { ok: true };
  }

  async createNetwork(spec) {
    const data = await this._request('POST', '/networks', {
      name: spec.name,
      ip_range: spec.ipRange || '10.0.0.0/16',
      labels: spec.labels || {},
      subnets: spec.subnets || [
        {
          type: 'cloud',
          network_zone: spec.networkZone || 'eu-central',
          ip_range: spec.subnetRange || '10.0.0.0/24',
        },
      ],
    });
    return {
      network: {
        externalId: String(data.network.id),
        name: data.network.name,
        ipRange: data.network.ip_range,
      },
    };
  }

  async deleteNetwork(externalId) {
    await this._request('DELETE', `/networks/${externalId}`);
    return { ok: true };
  }

  async createPlacementGroup(spec) {
    const data = await this._request('POST', '/placement_groups', {
      name: spec.name,
      type: spec.type || 'spread',
      labels: spec.labels || {},
    });
    return {
      placementGroup: {
        externalId: String(data.placement_group.id),
        name: data.placement_group.name,
        type: data.placement_group.type,
      },
    };
  }

  async reset(externalId) {
    const data = await this._request('POST', `/servers/${externalId}/actions/reset`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async rebuild(externalId, image) {
    const data = await this._request('POST', `/servers/${externalId}/actions/rebuild`, {
      image,
    });
    return {
      action: { id: String(data.action.id), status: data.action.status },
      rootPassword: data.root_password || null,
    };
  }

  async enableRescue(externalId, opts = {}) {
    const data = await this._request('POST', `/servers/${externalId}/actions/enable_rescue`, {
      type: opts.type || 'linux64',
      ssh_keys: opts.sshKeys || [],
    });
    return {
      action: { id: String(data.action.id), status: data.action.status },
      rootPassword: data.root_password || null,
    };
  }

  async disableRescue(externalId) {
    const data = await this._request('POST', `/servers/${externalId}/actions/disable_rescue`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async renameServer(externalId, name) {
    const data = await this._request('PUT', `/servers/${externalId}`, { name });
    return { server: this._mapServer(data.server) };
  }

  async changeServerProtection(externalId, opts = {}) {
    const data = await this._request(
      'POST',
      `/servers/${externalId}/actions/change_protection`,
      {
        delete: !!opts.delete,
        rebuild: !!opts.rebuild,
      }
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async updateServerLabels(externalId, labels) {
    const data = await this._request('PUT', `/servers/${externalId}`, {
      labels: labels || {},
    });
    return { server: this._mapServer(data.server) };
  }

  async attachIso(externalId, iso) {
    const data = await this._request('POST', `/servers/${externalId}/actions/attach_iso`, {
      iso,
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async detachIso(externalId) {
    const data = await this._request('POST', `/servers/${externalId}/actions/detach_iso`);
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async requestConsole(externalId) {
    const data = await this._request(
      'POST',
      `/servers/${externalId}/actions/request_console`
    );
    return {
      action: data.action
        ? { id: String(data.action.id), status: data.action.status }
        : null,
      wssUrl: data.wss_url || null,
      password: data.password || null,
    };
  }

  async enableBackup(externalId) {
    const data = await this._request(
      'POST',
      `/servers/${externalId}/actions/enable_backup`
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async disableBackup(externalId) {
    const data = await this._request(
      'POST',
      `/servers/${externalId}/actions/disable_backup`
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async getServerMetrics(_externalId, _opts) {
    throw cloudError(
      501,
      'Server metrics charts are coming soon (use provider console for live graphs)',
      'coming_soon'
    );
  }

  async listIsos() {
    const data = await this._request('GET', '/isos?per_page=50');
    return (data.isos || []).map((i) => ({
      id: String(i.id),
      name: i.name,
      description: i.description,
      type: i.type,
      architecture: i.architecture,
    }));
  }

  async resizeVolume(externalId, sizeGb) {
    const data = await this._request('POST', `/volumes/${externalId}/actions/resize`, {
      size: Number(sizeGb),
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async setFirewallRules(externalId, rules) {
    const data = await this._request('POST', `/firewalls/${externalId}/actions/set_rules`, {
      rules: rules || [],
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async applyFirewallToResources(externalId, applyTo) {
    const data = await this._request(
      'POST',
      `/firewalls/${externalId}/actions/apply_to_resources`,
      { apply_to: applyTo || [] }
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async addNetworkSubnet(networkId, subnet) {
    const data = await this._request('POST', `/networks/${networkId}/actions/add_subnet`, {
      type: subnet.type || 'cloud',
      network_zone: subnet.networkZone || 'eu-central',
      ip_range: subnet.ipRange || subnet.ip_range,
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async attachServerToNetwork(networkId, serverId, opts = {}) {
    const data = await this._request(
      'POST',
      `/networks/${networkId}/actions/add_server`,
      {
        server: Number(serverId),
        ip: opts.ip || undefined,
        alias_ips: opts.aliasIps || undefined,
      }
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async detachServerFromNetwork(networkId, serverId) {
    const data = await this._request(
      'POST',
      `/networks/${networkId}/actions/remove_server`,
      { server: Number(serverId) }
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async addNetworkRoute(networkId, route) {
    const data = await this._request('POST', `/networks/${networkId}/actions/add_route`, {
      destination: route.destination,
      gateway: route.gateway,
    });
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async deletePlacementGroup(externalId) {
    await this._request('DELETE', `/placement_groups/${externalId}`);
    return { ok: true };
  }

  async listPlacementGroups() {
    const data = await this._request('GET', '/placement_groups');
    return (data.placement_groups || []).map((g) => ({
      id: String(g.id),
      name: g.name,
      type: g.type,
      servers: g.servers || [],
    }));
  }

  async createPrimaryIp(spec) {
    const data = await this._request('POST', '/primary_ips', {
      name: spec.name,
      type: spec.type || 'ipv4',
      assignee_type: spec.assigneeType || 'server',
      assignee_id: spec.serverExternalId
        ? Number(spec.serverExternalId)
        : undefined,
      datacenter: spec.datacenter,
      labels: spec.labels || {},
    });
    return {
      primaryIp: {
        externalId: String(data.primary_ip.id),
        name: data.primary_ip.name,
        ip: data.primary_ip.ip,
        type: data.primary_ip.type,
      },
    };
  }

  async deletePrimaryIp(externalId) {
    await this._request('DELETE', `/primary_ips/${externalId}`);
    return { ok: true };
  }

  async assignPrimaryIp(externalId, serverId) {
    const data = await this._request(
      'POST',
      `/primary_ips/${externalId}/actions/assign`,
      { assignee_id: Number(serverId), assignee_type: 'server' }
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async unassignPrimaryIp(externalId) {
    const data = await this._request(
      'POST',
      `/primary_ips/${externalId}/actions/unassign`
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async listPrimaryIps() {
    const data = await this._request('GET', '/primary_ips');
    return (data.primary_ips || []).map((p) => ({
      id: String(p.id),
      name: p.name,
      ip: p.ip,
      type: p.type,
      assigneeId: p.assignee_id ? String(p.assignee_id) : null,
    }));
  }

  async createFloatingIp(spec) {
    const data = await this._request('POST', '/floating_ips', {
      name: spec.name,
      type: spec.type || 'ipv4',
      home_location: spec.location || spec.homeLocation,
      server: spec.serverExternalId ? Number(spec.serverExternalId) : undefined,
      labels: spec.labels || {},
    });
    return {
      floatingIp: {
        externalId: String(data.floating_ip.id),
        name: data.floating_ip.name,
        ip: data.floating_ip.ip,
        type: data.floating_ip.type,
      },
    };
  }

  async deleteFloatingIp(externalId) {
    await this._request('DELETE', `/floating_ips/${externalId}`);
    return { ok: true };
  }

  async assignFloatingIp(externalId, serverId) {
    const data = await this._request(
      'POST',
      `/floating_ips/${externalId}/actions/assign`,
      { server: Number(serverId) }
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async unassignFloatingIp(externalId) {
    const data = await this._request(
      'POST',
      `/floating_ips/${externalId}/actions/unassign`
    );
    return { action: { id: String(data.action.id), status: data.action.status } };
  }

  async listFloatingIps() {
    const data = await this._request('GET', '/floating_ips');
    return (data.floating_ips || []).map((f) => ({
      id: String(f.id),
      name: f.name,
      ip: f.ip,
      type: f.type,
      server: f.server ? String(f.server) : null,
    }));
  }

  async setReverseDns(ip, ptr) {
    const list = await this._request(
      'GET',
      `/primary_ips?name=${encodeURIComponent(ip)}`
    );
    let primary = (list.primary_ips || []).find((p) => p.ip === ip);
    if (!primary) {
      const all = await this._request('GET', '/primary_ips');
      primary = (all.primary_ips || []).find((p) => p.ip === ip);
    }
    if (primary) {
      await this._request('POST', `/primary_ips/${primary.id}/actions/change_dns_ptr`, {
        ip,
        dns_ptr: ptr,
      });
      return { ok: true, ip, ptr, kind: 'primary' };
    }
    const floats = await this._request('GET', '/floating_ips');
    const flo = (floats.floating_ips || []).find((f) => f.ip === ip);
    if (!flo) {
      throw cloudError(404, `IP not found for reverse DNS: ${ip}`, 'not_found');
    }
    await this._request('POST', `/floating_ips/${flo.id}/actions/change_dns_ptr`, {
      ip,
      dns_ptr: ptr,
    });
    return { ok: true, ip, ptr, kind: 'floating' };
  }

  async createLoadBalancer(spec) {
    const data = await this._request('POST', '/load_balancers', {
      name: spec.name,
      load_balancer_type: spec.type || spec.loadBalancerType || 'lb11',
      location: spec.location,
      algorithm: spec.algorithm || { type: 'round_robin' },
      services: spec.services || [
        {
          protocol: 'http',
          listen_port: 80,
          destination_port: 80,
        },
      ],
      targets: spec.targets || [],
      labels: spec.labels || {},
      network: spec.networkExternalId
        ? Number(spec.networkExternalId)
        : undefined,
    });
    return {
      loadBalancer: {
        externalId: String(data.load_balancer.id),
        name: data.load_balancer.name,
        publicIpv4: data.load_balancer.public_net?.ipv4?.ip || null,
        type: data.load_balancer.load_balancer_type?.name,
      },
    };
  }

  async deleteLoadBalancer(externalId) {
    await this._request('DELETE', `/load_balancers/${externalId}`);
    return { ok: true };
  }

  async listLoadBalancers() {
    const data = await this._request('GET', '/load_balancers');
    return (data.load_balancers || []).map((lb) => ({
      id: String(lb.id),
      name: lb.name,
      publicIpv4: lb.public_net?.ipv4?.ip || null,
      type: lb.load_balancer_type?.name,
    }));
  }

  async createCertificate(spec) {
    const data = await this._request('POST', '/certificates', {
      name: spec.name,
      type: spec.type || 'uploaded',
      certificate: spec.certificate,
      private_key: spec.privateKey,
      domain_names: spec.domainNames,
    });
    return {
      certificate: {
        externalId: String(data.certificate.id),
        name: data.certificate.name,
        type: data.certificate.type,
      },
    };
  }

  async deleteCertificate(externalId) {
    await this._request('DELETE', `/certificates/${externalId}`);
    return { ok: true };
  }

  async listCertificates() {
    const data = await this._request('GET', '/certificates');
    return (data.certificates || []).map((c) => ({
      id: String(c.id),
      name: c.name,
      type: c.type,
      domainNames: c.domain_names || [],
    }));
  }

  async getAction(actionId) {
    const data = await this._request('GET', `/actions/${actionId}`);
    return {
      id: String(data.action.id),
      status: data.action.status,
      error: data.action.error || null,
    };
  }
}

module.exports = { HetznerProvider, OS_IMAGE_HINTS };
