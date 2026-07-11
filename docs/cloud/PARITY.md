# Cloud Console Parity

Hetzner Cloud Console işlemleri ile Studio Cloud eşlemesi.

| Hetzner action | Bizim UI | Durum |
|----------------|----------|-------|
| Server create/delete | `/app/cloud/servers` | **full** |
| Power on/off, reboot, reset | Servers (+ ⋯ menü) | **full** |
| Resize / rebuild / rescue | Servers ⋯ | **full** |
| Rename, labels, protect | Servers ⋯ | **full** |
| ISO attach/detach | Servers ⋯ | **full** |
| Console (WSS) | Servers ⋯ → Activity | **full** |
| Backups enable/disable | Servers ⋯ | **full** |
| Metrics graphs | Servers ⋯ | **stub** (501) |
| Primary IPs | `/app/cloud/primary-ips` | **full** |
| Floating IPs | `/app/cloud/floating-ips` | **full** |
| Reverse DNS | `/app/cloud/dns` | **full** |
| Volumes CRUD + resize | `/app/cloud/volumes` | **full** |
| Firewalls + apply | `/app/cloud/firewalls` | **full** |
| Networks + subnet/attach | `/app/cloud/networks` | **full** |
| Load Balancers MVP | `/app/cloud/load-balancers` | **partial** |
| SSH Keys | `/app/cloud/ssh-keys` | **full** |
| Snapshots | `/app/cloud/snapshots` | **full** |
| Placement Groups | `/app/cloud/placement-groups` | **full** |
| Certificates | `/app/cloud/certificates` | **partial** |
| Providers / tokens | `/app/cloud/providers` | **full** |
| Activity / Actions | `/app/cloud/activity` | **full** |
| Live matrix | `/app/cloud/parity` + `GET /api/cloud/parity` | **full** |

Retail markup (+20% EUR) değişmedi. DB Pro/Scale/Max dokunulmadı.

See also: [API.md](./API.md), [PRICING.md](./PRICING.md), [CONFIG.md](./CONFIG.md).
