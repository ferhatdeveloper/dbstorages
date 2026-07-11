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
];

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
        const n = `${img.name || ''} ${img.description || ''}`.toLowerCase();
        return OS_IMAGE_HINTS.some((h) => n.includes(h));
      })
      .map((img) => ({
        id: String(img.id),
        name: img.name,
        description: img.description,
        osFlavor: img.os_flavor,
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

  async setReverseDns(ip, ptr) {
    // Primary IPs reverse DNS
    const list = await this._request('GET', `/primary_ips?name=${encodeURIComponent(ip)}`);
    const primary = (list.primary_ips || []).find((p) => p.ip === ip);
    if (!primary) {
      throw cloudError(404, `Primary IP not found for ${ip}`, 'not_found');
    }
    await this._request('PUT', `/primary_ips/${primary.id}`, {
      name: primary.name,
      dns_ptr: ptr,
    });
    return { ok: true, ip, ptr };
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
