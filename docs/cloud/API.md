# Cloud REST API

Base: `/api/cloud`  
Auth: `Authorization: Bearer <platform JWT>`  
Scope: tenant membership required (`tenantId` query/body optional if user has a primary membership)

## Providers

| Method | Path | Notes |
|--------|------|--------|
| GET | `/slugs` | Supported driver slugs |
| GET | `/providers` | List (no secrets) |
| POST | `/providers` | `{ name, slug, apiKey?, config?, projectId? }` |

## Servers

| Method | Path | Status |
|--------|------|--------|
| GET | `/servers` | 200 |
| POST | `/servers` | **202** + `operationId` |
| GET | `/servers/:id` | 200 |
| DELETE | `/servers/:id` | **202** |
| POST | `/servers/:id/reboot` | 202 |
| POST | `/servers/:id/power-on` | 202 |
| POST | `/servers/:id/power-off` | 202 |

Create body:

```json
{
  "providerId": "cprv_…",
  "name": "web-1",
  "serverType": "cx22",
  "image": "ubuntu-22.04",
  "location": "nbg1",
  "sshKeys": [],
  "userData": "#cloud-config\n…",
  "enableIpv4": true,
  "enableIpv6": true
}
```

## Catalog

| GET | Query |
|-----|-------|
| `/images?providerId=` | OS images |
| `/regions?providerId=` | Locations |
| `/server-types?providerId=` | Types |
| `/catalog/:kind?providerId=` | images \| regions \| server-types \| ssh-keys |

## Other resources

- `GET/POST /volumes`, `/firewalls`, `/snapshots`, `/ssh-keys`, `/networks`
- `GET /operations`, `GET /operations/:id` — poll async jobs

## Errors

```json
{ "success": false, "error": { "code": "validation", "message": "…" } }
```

Never returns decrypted API keys.
