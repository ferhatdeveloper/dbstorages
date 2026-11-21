/**
 * WireGuard client config text + optional QR (PNG data URL).
 */
function buildClientConfig({
  privateKey,
  addressCidr,
  dns,
  serverPublicKey,
  endpoint,
  allowedIps,
  persistentKeepalive = 25,
}) {
  const lines = [
    '[Interface]',
    `PrivateKey = ${privateKey}`,
    `Address = ${addressCidr}`,
  ];
  if (dns) lines.push(`DNS = ${dns}`);
  lines.push('', '[Peer]', `PublicKey = ${serverPublicKey}`);
  if (endpoint) lines.push(`Endpoint = ${endpoint}`);
  lines.push(
    `AllowedIPs = ${allowedIps}`,
    `PersistentKeepalive = ${persistentKeepalive}`
  );
  return lines.join('\n') + '\n';
}

async function configToQrDataUrl(configText) {
  try {
    const QRCode = require('qrcode');
    return await QRCode.toDataURL(configText, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 280,
      type: 'image/png',
    });
  } catch (err) {
    console.warn('[vpn] qrcode unavailable:', err.message);
    return null;
  }
}

function vpnEnvDefaults() {
  const subnet = process.env.WIREGUARD_SUBNET || '10.66.0.0/24';
  const endpoint = process.env.WIREGUARD_ENDPOINT || null;
  const serverPublicKey = process.env.WIREGUARD_SERVER_PUBLIC_KEY || null;
  const dns = process.env.WIREGUARD_DNS || '1.1.1.1';
  const mock = !endpoint || !serverPublicKey;
  return { subnet, endpoint, serverPublicKey, dns, mock };
}

module.exports = {
  buildClientConfig,
  configToQrDataUrl,
  vpnEnvDefaults,
};
