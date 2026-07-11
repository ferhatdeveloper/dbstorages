/**
 * @typedef {object} CloudServerSpec
 * @property {string} name
 * @property {string} serverType
 * @property {string} image
 * @property {string} location
 * @property {string[]} [sshKeys]
 * @property {string} [userData]
 * @property {boolean} [enableIpv4]
 * @property {boolean} [enableIpv6]
 * @property {object} [labels]
 * @property {string[]} [networks]
 * @property {string} [placementGroup]
 * @property {string[]} [firewalls]
 */

/**
 * Provider-agnostic cloud driver contract.
 * Concrete drivers live under ./providers — never reference vendor names
 * from controllers or CloudService beyond slug resolution.
 *
 * @interface CloudProvider
 */
class CloudProvider {
  async createServer(_spec) {
    throw new Error('createServer not implemented');
  }
  async deleteServer(_externalId) {
    throw new Error('deleteServer not implemented');
  }
  async powerOn(_externalId) {
    throw new Error('powerOn not implemented');
  }
  async powerOff(_externalId) {
    throw new Error('powerOff not implemented');
  }
  async reboot(_externalId) {
    throw new Error('reboot not implemented');
  }
  async reset(_externalId) {
    throw new Error('reset not implemented');
  }
  async resize(_externalId, _serverType) {
    throw new Error('resize not implemented');
  }
  async rebuild(_externalId, _image) {
    throw new Error('rebuild not implemented');
  }
  async enableRescue(_externalId, _opts) {
    throw new Error('enableRescue not implemented');
  }
  async disableRescue(_externalId) {
    throw new Error('disableRescue not implemented');
  }
  async renameServer(_externalId, _name) {
    throw new Error('renameServer not implemented');
  }
  async changeServerProtection(_externalId, _opts) {
    throw new Error('changeServerProtection not implemented');
  }
  async updateServerLabels(_externalId, _labels) {
    throw new Error('updateServerLabels not implemented');
  }
  async attachIso(_externalId, _iso) {
    throw new Error('attachIso not implemented');
  }
  async detachIso(_externalId) {
    throw new Error('detachIso not implemented');
  }
  async requestConsole(_externalId) {
    throw new Error('requestConsole not implemented');
  }
  async enableBackup(_externalId) {
    throw new Error('enableBackup not implemented');
  }
  async disableBackup(_externalId) {
    throw new Error('disableBackup not implemented');
  }
  async getServerMetrics(_externalId, _opts) {
    throw Object.assign(new Error('Server metrics not available yet'), {
      code: 'coming_soon',
      status: 501,
    });
  }
  async listIsos() {
    return [];
  }

  async createVolume(_spec) {
    throw new Error('createVolume not implemented');
  }
  async attachVolume(_volumeId, _serverId) {
    throw new Error('attachVolume not implemented');
  }
  async detachVolume(_volumeId, _serverId) {
    throw new Error('detachVolume not implemented');
  }
  async deleteVolume(_externalId) {
    throw new Error('deleteVolume not implemented');
  }
  async resizeVolume(_externalId, _sizeGb) {
    throw new Error('resizeVolume not implemented');
  }

  async createFirewall(_spec) {
    throw new Error('createFirewall not implemented');
  }
  async deleteFirewall(_externalId) {
    throw new Error('deleteFirewall not implemented');
  }
  async setFirewallRules(_externalId, _rules) {
    throw new Error('setFirewallRules not implemented');
  }
  async applyFirewallToResources(_externalId, _applyTo) {
    throw new Error('applyFirewallToResources not implemented');
  }

  async createSnapshot(_serverId, _name) {
    throw new Error('createSnapshot not implemented');
  }
  async restoreSnapshot(_snapshotId, _spec) {
    throw new Error('restoreSnapshot not implemented');
  }
  async deleteSnapshot(_externalId) {
    throw new Error('deleteSnapshot not implemented');
  }

  async listImages() {
    throw new Error('listImages not implemented');
  }
  async listLocations() {
    throw new Error('listLocations not implemented');
  }
  async listServerTypes() {
    throw new Error('listServerTypes not implemented');
  }

  async listSSHKeys() {
    throw new Error('listSSHKeys not implemented');
  }
  async createSSHKey(_spec) {
    throw new Error('createSSHKey not implemented');
  }
  async deleteSSHKey(_externalId) {
    throw new Error('deleteSSHKey not implemented');
  }

  async createNetwork(_spec) {
    throw Object.assign(new Error('createNetwork not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async deleteNetwork(_externalId) {
    throw Object.assign(new Error('deleteNetwork not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async addNetworkSubnet(_networkId, _subnet) {
    throw Object.assign(new Error('addNetworkSubnet not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async attachServerToNetwork(_networkId, _serverId, _opts) {
    throw Object.assign(new Error('attachServerToNetwork not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async detachServerFromNetwork(_networkId, _serverId) {
    throw Object.assign(new Error('detachServerFromNetwork not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async addNetworkRoute(_networkId, _route) {
    throw Object.assign(new Error('addNetworkRoute not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }

  async createPlacementGroup(_spec) {
    throw Object.assign(new Error('createPlacementGroup not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async deletePlacementGroup(_externalId) {
    throw Object.assign(new Error('deletePlacementGroup not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async listPlacementGroups() {
    return [];
  }

  async createPrimaryIp(_spec) {
    throw Object.assign(new Error('createPrimaryIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async deletePrimaryIp(_externalId) {
    throw Object.assign(new Error('deletePrimaryIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async assignPrimaryIp(_externalId, _serverId) {
    throw Object.assign(new Error('assignPrimaryIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async unassignPrimaryIp(_externalId) {
    throw Object.assign(new Error('unassignPrimaryIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async listPrimaryIps() {
    return [];
  }

  async createFloatingIp(_spec) {
    throw Object.assign(new Error('createFloatingIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async deleteFloatingIp(_externalId) {
    throw Object.assign(new Error('deleteFloatingIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async assignFloatingIp(_externalId, _serverId) {
    throw Object.assign(new Error('assignFloatingIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async unassignFloatingIp(_externalId) {
    throw Object.assign(new Error('unassignFloatingIp not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async listFloatingIps() {
    return [];
  }

  async setReverseDns(_ip, _ptr) {
    throw Object.assign(new Error('setReverseDns not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }

  async createLoadBalancer(_spec) {
    throw Object.assign(new Error('createLoadBalancer not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async deleteLoadBalancer(_externalId) {
    throw Object.assign(new Error('deleteLoadBalancer not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async listLoadBalancers() {
    return [];
  }

  async createCertificate(_spec) {
    throw Object.assign(new Error('createCertificate not implemented'), {
      code: 'coming_soon',
      status: 501,
    });
  }
  async deleteCertificate(_externalId) {
    throw Object.assign(new Error('deleteCertificate not implemented'), {
      code: 'coming_soon',
      status: 501,
    });
  }
  async listCertificates() {
    return [];
  }

  async getAction(actionId) {
    return { id: actionId, status: 'unknown' };
  }
}

module.exports = { CloudProvider };
