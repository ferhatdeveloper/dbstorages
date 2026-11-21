/**
 * WireGuard Curve25519 (X25519) keypair generation.
 * Uses Node crypto when available; no wireguard-tools required on Windows.
 */
const crypto = require('crypto');
const { execFileSync } = require('child_process');

function rawFromDer(der, kind) {
  // PKCS8 / SPKI for X25519: raw 32-byte key is the trailing octets
  if (!Buffer.isBuffer(der) || der.length < 32) {
    throw new Error(`Invalid ${kind} DER length`);
  }
  return der.subarray(der.length - 32);
}

function generateKeyPairNative() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');
  const privDer = privateKey.export({ type: 'pkcs8', format: 'der' });
  const pubDer = publicKey.export({ type: 'spki', format: 'der' });
  return {
    privateKey: rawFromDer(privDer, 'private').toString('base64'),
    publicKey: rawFromDer(pubDer, 'public').toString('base64'),
  };
}

/** Optional: use `wg genkey` / `wg pubkey` when wireguard-tools is on PATH. */
function generateKeyPairViaWg() {
  const priv = execFileSync('wg', ['genkey'], {
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  }).trim();
  const pub = execFileSync('wg', ['pubkey'], {
    input: priv + '\n',
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  }).trim();
  if (!priv || !pub) throw new Error('wg produced empty keys');
  return { privateKey: priv, publicKey: pub };
}

function generateKeyPair() {
  if (process.env.WIREGUARD_USE_WG === '1') {
    try {
      return generateKeyPairViaWg();
    } catch (err) {
      console.warn('[vpn] wg unavailable, falling back to crypto:', err.message);
    }
  }
  return generateKeyPairNative();
}

module.exports = { generateKeyPair, generateKeyPairNative };
