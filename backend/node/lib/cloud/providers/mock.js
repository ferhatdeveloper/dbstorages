/**
 * In-memory mock provider for unit/smoke tests — no vendor coupling.
 */
const { CloudProvider } = require('../providerInterface');
const { randomUUID } = require('crypto');

class MockCloudProvider extends CloudProvider {
  constructor() {
    super();
    this.servers = new Map();
    this.volumes = new Map();
    this.firewalls = new Map();
    this.snapshots = new Map();
    this.sshKeys = new Map();
    this.networks = new Map();
    this.actions = new Map();
    this._seq = 1;
  }

  _id() {
    const n = this._seq;
    this._seq += 1;
    return String(n);
  }

  _action(status = 'success') {
    const id = this._id();
    const a = { id, status };
    this.actions.set(id, a);
    return a;
  }

  async createServer(spec) {
    const externalId = this._id();
    const server = {
      externalId,
      name: spec.name,
      status: 'running',
      serverType: spec.serverType,
      image: spec.image,
      location: spec.location,
      ipv4: `203.0.113.${externalId}`,
      ipv6: null,
      labels: spec.labels || {},
    };
    this.servers.set(externalId, server);
    return {
      server,
      action: this._action('running'),
      rootPassword: 'mock-root-pass',
    };
  }

  async deleteServer(externalId) {
    this.servers.delete(String(externalId));
    return { ok: true };
  }

  async powerOn(externalId) {
    const s = this.servers.get(String(externalId));
    if (s) s.status = 'running';
    return { action: this._action() };
  }

  async powerOff(externalId) {
    const s = this.servers.get(String(externalId));
    if (s) s.status = 'off';
    return { action: this._action() };
  }

  async reboot(externalId) {
    return { action: this._action() };
  }

  async resize(externalId, serverType) {
    const s = this.servers.get(String(externalId));
    if (s) s.serverType = serverType;
    return { action: this._action() };
  }

  async createVolume(spec) {
    const externalId = this._id();
    const volume = {
      externalId,
      name: spec.name,
      sizeGb: spec.sizeGb || 10,
      location: spec.location,
      status: 'available',
    };
    this.volumes.set(externalId, volume);
    return { volume, action: this._action() };
  }

  async attachVolume(volumeId, serverId) {
    return { action: this._action() };
  }

  async detachVolume(volumeId) {
    return { action: this._action() };
  }

  async deleteVolume(externalId) {
    this.volumes.delete(String(externalId));
    return { ok: true };
  }

  async createFirewall(spec) {
    const externalId = this._id();
    const firewall = {
      externalId,
      name: spec.name,
      rules: spec.rules || [],
    };
    this.firewalls.set(externalId, firewall);
    return { firewall };
  }

  async deleteFirewall(externalId) {
    this.firewalls.delete(String(externalId));
    return { ok: true };
  }

  async createSnapshot(serverId, name) {
    const externalId = this._id();
    const image = { externalId, name: name || `snap-${externalId}` };
    this.snapshots.set(externalId, image);
    return { action: this._action(), image };
  }

  async restoreSnapshot(snapshotId, spec) {
    return this.createServer({ ...spec, image: snapshotId });
  }

  async deleteSnapshot(externalId) {
    this.snapshots.delete(String(externalId));
    return { ok: true };
  }

  async listImages() {
    return [
      { id: 'ubuntu-22.04', name: 'ubuntu-22.04', description: 'Ubuntu 22.04', osFlavor: 'ubuntu' },
      { id: 'debian-12', name: 'debian-12', description: 'Debian 12', osFlavor: 'debian' },
      { id: 'alma-9', name: 'alma-9', description: 'AlmaLinux 9', osFlavor: 'alma' },
      { id: 'rocky-9', name: 'rocky-9', description: 'Rocky Linux 9', osFlavor: 'rocky' },
      { id: 'fedora-39', name: 'fedora-39', description: 'Fedora 39', osFlavor: 'fedora' },
      { id: 'centos-stream-9', name: 'centos-stream-9', description: 'CentOS Stream 9', osFlavor: 'centos' },
    ];
  }

  async listLocations() {
    return [
      { id: '1', name: 'nbg1', description: 'Nuremberg', country: 'DE', city: 'Nuremberg' },
      { id: '2', name: 'fsn1', description: 'Falkenstein', country: 'DE', city: 'Falkenstein' },
      { id: '3', name: 'hel1', description: 'Helsinki', country: 'FI', city: 'Helsinki' },
    ];
  }

  async listServerTypes() {
    return [
      { id: '1', name: 'cx22', description: 'CX22', cores: 2, memory: 4, disk: 40 },
      { id: '2', name: 'cx32', description: 'CX32', cores: 4, memory: 8, disk: 80 },
    ];
  }

  async listSSHKeys() {
    return [...this.sshKeys.values()];
  }

  async createSSHKey(spec) {
    const externalId = this._id();
    const sshKey = {
      externalId,
      name: spec.name,
      fingerprint: `fp-${randomUUID().slice(0, 8)}`,
      publicKey: spec.publicKey,
    };
    this.sshKeys.set(externalId, sshKey);
    return { sshKey };
  }

  async deleteSSHKey(externalId) {
    this.sshKeys.delete(String(externalId));
    return { ok: true };
  }

  async createNetwork(spec) {
    const externalId = this._id();
    const network = {
      externalId,
      name: spec.name,
      ipRange: spec.ipRange || '10.0.0.0/16',
    };
    this.networks.set(externalId, network);
    return { network };
  }

  async deleteNetwork(externalId) {
    this.networks.delete(String(externalId));
    return { ok: true };
  }

  async createPlacementGroup(spec) {
    return {
      placementGroup: {
        externalId: this._id(),
        name: spec.name,
        type: spec.type || 'spread',
      },
    };
  }

  async setReverseDns(ip, ptr) {
    return { ok: true, ip, ptr };
  }

  async getAction(actionId) {
    return this.actions.get(String(actionId)) || { id: actionId, status: 'success' };
  }
}

module.exports = { MockCloudProvider };
