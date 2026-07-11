# Cloud VPS Pricing

## Policy

DBStorages VPS (Cloud Infrastructure) retail prices use:

```
price_retail = round(hetzner_list_price × 1.20, 2)
```

| Field | Meaning |
|-------|---------|
| Currency | **EUR** canonical for VPS/VPN (Hetzner basis; excl. VAT). Display also in **USD** / **TRY** via live FX. |
| Provider cost | Hetzner monthly net (excl. Primary IPv4) |
| Retail | Provider × **1.20** (20% markup) |
| DB plans | Pro **$34** / Scale **$50** / Max **$99** — USD canonical; UI converts with live rates |
| Backup addon | **$10**/mo — USD canonical |
| WireGuard VPN | **€5.99 / kullanıcı / ay** — EUR canonical |
| FX | `GET /api/fx` — Frankfurter (EUR base) → USD + TRY, 10 dk cache + static fallback |

Public endpoints:

- `GET /api/fx` — `{ base, rates: { EUR, USD, TRY }, fetchedAt, source }`
- `GET /api/cloud/public-catalog` (+ `fx`)
- `GET /api/cloud/quote?serverType=cx23`
- `GET /api/packages` → `vpsCatalog` + `fx`

## Example (EU, excl. VAT, excl. IPv4)

| Type | Specs | Hetzner | Retail (+20%) |
|------|-------|---------|---------------|
| CX23 | 2 / 4 GB / 40 GB | €5.49 | **€6.59** |
| CX33 | 4 / 8 GB / 80 GB | €8.49 | **€10.19** |
| CAX11 | 2 / 4 GB / 40 GB | €5.99 | **€7.19** |
| CPX22 | 2 / 4 GB / 80 GB | €19.49 | **€23.39** |
| CCX13 | 2 / 8 GB / 80 GB | €42.99 | **€51.59** |

### Add-ons (also × 1.20)

| Item | Provider | Retail |
|------|----------|--------|
| Volume / GB | €0.0572 | €0.0686 |
| Snapshot / GB | €0.0143 | €0.0172 |
| Primary IPv4 | €0.50 | €0.60 |
| Firewall / Network | €0 | €0 |
| Auto backups | 20% of instance | 20% of retail instance |

## Structures provisioned (DBStorages Cloud)

Mapped from Hetzner Cloud Console concepts:

- **Servers** — type, image, location, SSH, cloud-init, IPv4/IPv6
- **Volumes** — size Gb, attach/detach
- **Snapshots** — create / restore / delete
- **Firewalls** — rules JSON
- **Networks** — IP range / subnets
- **Primary IPs** — reverse DNS via provider
- **Locations** — nbg1, fsn1, hel1, ash, hil, sin

## Where to see in UI

- Landing → **VPS & Cloud Infrastructure** (`#cloud-vps`) — popular plans with retail EUR
- Landing → **WireGuard VPN** (`#cloud-vpn`) — €5.99/kullanıcı/ay
- Pricing → **VPS Kiralama** ek hizmet (`#vps-addon`) — same catalog
- Pricing → **WireGuard VPN** (`#vpn-addon`) — per-user math
- Studio → **Cloud → Servers → Provision** — size dropdown with specs + retail quote
- Studio → **Cloud → VPN / WireGuard** — peers, seats, .conf, QR
