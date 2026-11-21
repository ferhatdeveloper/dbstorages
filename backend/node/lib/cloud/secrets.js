/**
 * Encrypt / decrypt cloud provider API keys at rest.
 * Prefers CLOUD_SECRETS_KEY; falls back to JWT_SECRET-derived key.
 */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function secretsKey() {
  const raw =
    process.env.CLOUD_SECRETS_KEY ||
    process.env.JWT_SECRET ||
    'graphcore-dev-secret-change-me';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encryptSecret(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, secretsKey(), iv);
  const enc = Buffer.concat([
    cipher.update(String(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decryptSecret(payload) {
  if (!payload) return null;
  const parts = String(payload).split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') {
    throw new Error('Invalid encrypted secret format');
  }
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const data = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv(ALGO, secretsKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8'
  );
}

module.exports = { encryptSecret, decryptSecret };
