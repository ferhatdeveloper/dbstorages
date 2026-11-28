/**
 * Hetzner Cloud Console ↔ DBStorages Cloud parity matrix.
 * full = implemented end-to-end (API + UI)
 * partial = API works; UI minimal / limited
 * stub = honest 501 coming_soon (not fake success)
 */
const MATRIX = [
  { section: 'Servers', action: 'Create', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Delete', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Power on/off', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Reboot / Reset', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Resize', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Rebuild', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Rescue enable/disable', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Rename / Labels', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Protect delete/rebuild', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'ISO attach/detach', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Console (WSS URL)', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Backups enable/disable', path: '/app/cloud/servers', status: 'full' },
  { section: 'Servers', action: 'Metrics graphs', path: '/app/cloud/servers', status: 'stub' },
  { section: 'Primary IPs', action: 'CRUD + assign/unassign', path: '/app/cloud/primary-ips', status: 'full' },
  { section: 'Floating IPs', action: 'CRUD + assign/unassign', path: '/app/cloud/floating-ips', status: 'full' },
  { section: 'DNS', action: 'Reverse DNS (PTR)', path: '/app/cloud/dns', status: 'full' },
  { section: 'Volumes', action: 'Create / attach / detach / resize / delete', path: '/app/cloud/volumes', status: 'full' },
  { section: 'Firewalls', action: 'Create / rules / apply / delete', path: '/app/cloud/firewalls', status: 'full' },
  { section: 'Networks', action: 'Create / subnet / attach / route / delete', path: '/app/cloud/networks', status: 'full' },
  { section: 'Load Balancers', action: 'Create / delete (MVP)', path: '/app/cloud/load-balancers', status: 'partial' },
  { section: 'SSH Keys', action: 'Create / delete', path: '/app/cloud/ssh-keys', status: 'full' },
  { section: 'Snapshots', action: 'Create / restore / delete', path: '/app/cloud/snapshots', status: 'full' },
  { section: 'Placement Groups', action: 'Create / delete', path: '/app/cloud/placement-groups', status: 'full' },
  { section: 'Certificates', action: 'Create / delete (MVP)', path: '/app/cloud/certificates', status: 'partial' },
  { section: 'Providers', action: 'API tokens / slugs (Hetzner + Hostinger + Managed)', path: '/app/cloud/providers', status: 'full' },
  { section: 'Providers', action: 'Hostinger catalog / provision', path: '/app/cloud/servers', status: 'partial' },
  { section: 'VPN', action: 'WireGuard enable + peers + QR', path: '/app/cloud/vpn', status: 'full' },
  { section: 'Activity', action: 'Operations history', path: '/app/cloud/activity', status: 'full' },
  { section: 'Jobs', action: 'Active provisioning filter', path: '/app/cloud/jobs', status: 'full' },
];

module.exports = { MATRIX };
