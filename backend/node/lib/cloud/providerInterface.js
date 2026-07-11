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
 * Concrete drivers (e.g. Hetzner) live under ./providers — never reference
 * vendor names from controllers or CloudService beyond slug resolution.
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
  async resize(_externalId, _serverType) {
    throw new Error('resize not implemented');
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
  async createFirewall(_spec) {
    throw new Error('createFirewall not implemented');
  }
  async deleteFirewall(_externalId) {
    throw new Error('deleteFirewall not implemented');
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
  /** @returns {Promise<object>} */
  async createNetwork(_spec) {
    // Optional — stub until driver supports private networks
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
  async createPlacementGroup(_spec) {
    throw Object.assign(new Error('createPlacementGroup not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async setReverseDns(_ip, _ptr) {
    throw Object.assign(new Error('setReverseDns not implemented'), {
      code: 'not_implemented',
      status: 501,
    });
  }
  async getAction(actionId) {
    return { id: actionId, status: 'unknown' };
  }
}

module.exports = { CloudProvider };
