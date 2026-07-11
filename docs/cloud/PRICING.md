# Cloud VPS Pricing

## Policy

DBStorages VPS (Cloud Infrastructure) retail prices use:

```
price_retail = round(hetzner_list_price × 1.20, 2)
```

| Field | Meaning |
|-------|---------|
| Currency | **EUR** (same basis as Hetzner Cloud list; excl. VAT) |
| Provider cost | Hetzner monthly net (excl. Primary IPv4) |
| Retail | Provider × **1.20** (20% markup) |
| DB plans | Pro **$34** / Scale **$50** / Max **$99** — **unchanged** |
| Backup addon | **$10**/mo — **unchanged** |

VPS is a separate **ek hizmet** (not Stripe checkout metered yet). Quotes and server rows store `cost_provider` + `price_retail`.

## Catalog source

1. **Live** — when a cloud provider has an API token, `listServerTypes` / `listLocations` from the driver are used and enriched with markup.
2. **Seed** — `lib/cloud/catalog` ships Hetzner-like CX / CPX / CAX / CCX plans (EU Jun 2026 list) for offline UI and marketing.

Public endpoints:

- `GET /api/cloud/public-catalog`
- `GET /api/cloud/quote?serverType=cx23`
- `GET /api/packages` → `vpsCatalog`

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
- Pricing → **VPS Kiralama** ek hizmet (`#vps-addon`) — same catalog
- Studio → **Cloud → Servers → Provision** — size dropdown with specs + retail quote
