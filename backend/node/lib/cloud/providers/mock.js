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

  async listServerTypes() {
    const { getSeedServerTypes } = require('../catalog');
    return getSeedServerTypes().map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      cores: t.cores,
      memory: t.memoryGb,
      disk: t.diskGb,
      priceProviderMonthly: t.priceProviderMonthly,
      prices: [
        {
          location: 'nbg1',
          price_monthly: { net: String(t.priceProviderMonthly), gross: String(t.priceProviderMonthly) },
        },
      ],
    }));
  }

  async listLocations() {
    const { getSeedLocations } = require('../catalog');
    return getSeedLocations();
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
    const externalId = this._id();
    const pg = {
      externalId,
      name: spec.name,
      type: spec.type || 'spread',
    };
    if (!this.placementGroups) this.placementGroups = new Map();
    this.placementGroups.set(externalId, pg);
    return { placementGroup: pg };
  }

  async deletePlacementGroup(externalId) {
    this.placementGroups?.delete(String(externalId));
    return { ok: true };
  }

  async listPlacementGroups() {
    return [...(this.placementGroups?.values() || [])].map((g) => ({
      id: g.externalId,
      name: g.name,
      type: g.type,
      servers: [],
    }));
  }

  async reset(externalId) {
    return { action: this._action() };
  }

  async rebuild(externalId, image) {
    const s = this.servers.get(String(externalId));
    if (s) s.image = image;
    return { action: this._action(), rootPassword: 'mock-rebuild' };
  }

  async enableRescue(externalId) {
    return { action: this._action(), rootPassword: 'mock-rescue' };
  }

  async disableRescue(externalId) {
    return { action: this._action() };
  }

  async renameServer(externalId, name) {
    const s = this.servers.get(String(externalId));
    if (s) s.name = name;
    return { server: s };
  }

  async changeServerProtection(externalId, opts) {
    const s = this.servers.get(String(externalId));
    if (s) s.protection = opts;
    return { action: this._action() };
  }

  async updateServerLabels(externalId, labels) {
    const s = this.servers.get(String(externalId));
    if (s) s.labels = labels || {};
    return { server: s };
  }

  async attachIso(externalId, iso) {
    const s = this.servers.get(String(externalId));
    if (s) s.iso = iso;
    return { action: this._action() };
  }

  async detachIso(externalId) {
    const s = this.servers.get(String(externalId));
    if (s) s.iso = null;
    return { action: this._action() };
  }

  async requestConsole(externalId) {
    return {
      action: this._action(),
      wssUrl: `wss://mock.console/${externalId}`,
      password: 'mock-console',
    };
  }

  async enableBackup(externalId) {
    const s = this.servers.get(String(externalId));
    if (s) s.backup = true;
    return { action: this._action() };
  }

  async disableBackup(externalId) {
    const s = this.servers.get(String(externalId));
    if (s) s.backup = false;
    return { action: this._action() };
  }

  async getServerMetrics() {
    const err = new Error(
      'Server metrics charts are coming soon (use provider console for live graphs)'
    );
    err.status = 501;
    err.code = 'coming_soon';
    throw err;
  }

  async listIsos() {
    return [
      { id: '1', name: 'ubuntu-22.04-live', description: 'Ubuntu Live', type: 'public' },
    ];
  }

  async resizeVolume(externalId, sizeGb) {
    const v = this.volumes.get(String(externalId));
    if (v) v.sizeGb = sizeGb;
    return { action: this._action() };
  }

  async setFirewallRules(externalId, rules) {
    const f = this.firewalls.get(String(externalId));
    if (f) f.rules = rules || [];
    return { action: this._action() };
  }

  async applyFirewallToResources() {
    return { action: this._action() };
  }

  async addNetworkSubnet() {
    return { action: this._action() };
  }

  async attachServerToNetwork() {
    return { action: this._action() };
  }

  async detachServerFromNetwork() {
    return { action: this._action() };
  }

  async addNetworkRoute() {
    return { action: this._action() };
  }

  async createPrimaryIp(spec) {
    if (!this.primaryIps) this.primaryIps = new Map();
    const externalId = this._id();
    const primaryIp = {
      externalId,
      name: spec.name,
      ip: `203.0.113.${100 + Number(externalId)}`,
      type: spec.type || 'ipv4',
    };
    this.primaryIps.set(externalId, primaryIp);
    return { primaryIp };
  }

  async deletePrimaryIp(externalId) {
    this.primaryIps?.delete(String(externalId));
    return { ok: true };
  }

  async assignPrimaryIp() {
    return { action: this._action() };
  }

  async unassignPrimaryIp() {
    return { action: this._action() };
  }

  async listPrimaryIps() {
    return [...(this.primaryIps?.values() || [])].map((p) => ({
      id: p.externalId,
      name: p.name,
      ip: p.ip,
      type: p.type,
    }));
  }

  async createFloatingIp(spec) {
    if (!this.floatingIps) this.floatingIps = new Map();
    const externalId = this._id();
    const floatingIp = {
      externalId,
      name: spec.name,
      ip: `198.51.100.${externalId}`,
      type: spec.type || 'ipv4',
    };
    this.floatingIps.set(externalId, floatingIp);
    return { floatingIp };
  }

  async deleteFloatingIp(externalId) {
    this.floatingIps?.delete(String(externalId));
    return { ok: true };
  }

  async assignFloatingIp() {
    return { action: this._action() };
  }

  async unassignFloatingIp() {
    return { action: this._action() };
  }

  async listFloatingIps() {
    return [...(this.floatingIps?.values() || [])].map((f) => ({
      id: f.externalId,
      name: f.name,
      ip: f.ip,
      type: f.type,
    }));
  }

  async setReverseDns(ip, ptr) {
    return { ok: true, ip, ptr };
  }

  async createLoadBalancer(spec) {
    if (!this.loadBalancers) this.loadBalancers = new Map();
    const externalId = this._id();
    const loadBalancer = {
      externalId,
      name: spec.name,
      publicIpv4: `203.0.113.${50 + Number(externalId)}`,
      type: spec.type || 'lb11',
    };
    this.loadBalancers.set(externalId, loadBalancer);
    return { loadBalancer };
  }

  async deleteLoadBalancer(externalId) {
    this.loadBalancers?.delete(String(externalId));
    return { ok: true };
  }

  async listLoadBalancers() {
    return [...(this.loadBalancers?.values() || [])].map((lb) => ({
      id: lb.externalId,
      name: lb.name,
      publicIpv4: lb.publicIpv4,
      type: lb.type,
    }));
  }

  async createCertificate(spec) {
    if (!this.certificates) this.certificates = new Map();
    const externalId = this._id();
    const certificate = {
      externalId,
      name: spec.name,
      type: spec.type || 'uploaded',
    };
    this.certificates.set(externalId, certificate);
    return { certificate };
  }

  async deleteCertificate(externalId) {
    this.certificates?.delete(String(externalId));
    return { ok: true };
  }

  async listCertificates() {
    return [...(this.certificates?.values() || [])].map((c) => ({
      id: c.externalId,
      name: c.name,
      type: c.type,
      domainNames: [],
    }));
  }

  async getAction(actionId) {
    return this.actions.get(String(actionId)) || { id: actionId, status: 'success' };
  }
}

module.exports = { MockCloudProvider };
