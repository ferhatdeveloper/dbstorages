/**
 * @deprecated Prefer slug `managed` (ManagedCloudProvider). Alias for smoke tests only.
 */
const { ManagedCloudProvider } = require('./managed');
module.exports = {
  MockCloudProvider: ManagedCloudProvider,
  ManagedCloudProvider,
};
