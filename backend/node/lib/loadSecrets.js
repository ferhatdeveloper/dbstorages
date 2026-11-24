/**
 * Load optional secret overlays after dotenv.
 * Primary: iCloud Drive Backups/{GraphCore|dbstorages}/secrets/*.env
 * Fallback: ~/.cursor/secrets/{graphcore|dbstorages}-*.env
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

const ICLOUD_ROOT = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs/Backups'
);

function icloudSecretsDir(brand = 'GraphCore') {
  return path.join(ICLOUD_ROOT, brand, 'secrets');
}

/** @deprecated use icloudSecretsDir — GraphCore path preserved for callers */
function legacyIcloudSecretsDir() {
  return icloudSecretsDir('GraphCore');
}

function brandEnvFiles(secretsDir, baseName) {
  return [
    path.join(secretsDir, 'polar.env'),
    path.join(secretsDir, 'nowpayments.env'),
    path.join(secretsDir, 'lemonsqueezy.env'),
    path.join(secretsDir, `${baseName}.env`),
  ];
}

function homeEnvFiles(homeSecrets, prefix) {
  return [
    path.join(homeSecrets, `${prefix}-polar.env`),
    path.join(homeSecrets, `${prefix}-nowpayments.env`),
    path.join(homeSecrets, `${prefix}-lemonsqueezy.env`),
  ];
}

function candidatePaths() {
  const homeSecrets = path.join(os.homedir(), '.cursor/secrets');
  return [
    process.env.GRAPHCORE_SECRETS_FILE,
    process.env.DBSTORAGES_SECRETS_FILE,
    ...brandEnvFiles(icloudSecretsDir('GraphCore'), 'graphcore'),
    ...brandEnvFiles(icloudSecretsDir('dbstorages'), 'dbstorages'),
    ...homeEnvFiles(homeSecrets, 'graphcore'),
    ...homeEnvFiles(homeSecrets, 'dbstorages'),
  ].filter(Boolean);
}

function loadSecrets({ override = true } = {}) {
  const loaded = [];
  for (const file of candidatePaths()) {
    try {
      if (!file || !fs.existsSync(file)) continue;
      const result = dotenv.config({ path: file, override });
      if (!result.error) {
        loaded.push(file);
      }
    } catch (err) {
      console.warn('[secrets] skip', file, err.message);
    }
  }
  if (loaded.length) {
    console.log(
      '[secrets] loaded:',
      loaded.map((p) => p.replace(os.homedir(), '~')).join(', ')
    );
  }
  return loaded;
}

module.exports = {
  loadSecrets,
  icloudSecretsDir: legacyIcloudSecretsDir,
  candidatePaths,
};