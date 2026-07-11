# Cloud Providers

## Supported slugs

| Slug | Driver | Notes |
|------|--------|--------|
| `hetzner` | `HetznerProvider` | Official Cloud API v1 |
| `mock` | `MockCloudProvider` | Tests / local smoke |

Add a new driver:

1. Implement `CloudProvider` under `lib/cloud/providers/`
2. Register in `lib/cloud/factory.js` `DRIVERS`
3. Never reference the vendor from routes, UI copy (beyond user-chosen slug), or `CloudService`

## Hetzner

- Env default token: `HETZNER_API_TOKEN`
- Per-row token: encrypted `cloud_providers.api_key_enc` (preferred)
- Base URL override: `config.baseUrl` on provider row

### Implemented

- Servers: create/delete, power on/off, reboot, resize (change_type)
- Volumes: create, attach, detach, delete
- Firewalls: create, delete
- Snapshots: create image (snapshot), restore via createServer from image, delete image
- SSH keys: list/create/delete
- Catalog: images (Ubuntu/Debian/Alma/Rocky/Fedora/CentOS Stream filter), locations, server types
- Networks: create/delete private networks
- Placement groups: create
- Reverse DNS: via primary IPs API
- IPv4 / IPv6 flags on create
- cloud-init `user_data`

### Honest stubs / caveats

- Full primary-IP lifecycle UI not exposed (RDNS helper exists on driver)
- Firewall rule editor is API-level (pass `rules` JSON); Studio form starts with empty rules
- Placement group attach is via createServer `placementGroup` field
- Live Hetzner calls require a real token; CI uses `mock`

See [CONFIG.md](./CONFIG.md).
