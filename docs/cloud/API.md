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

- `GET/POST /volumes`, `DELETE /volumes/:id`, `POST /volumes/:id/resize|attach|detach`
- `GET/POST /firewalls`, `PUT /firewalls/:id/rules`, `POST /firewalls/:id/apply`, `DELETE`
- `GET/POST /snapshots`, `POST /snapshots/:id/restore`, `DELETE`
- `GET/POST /ssh-keys`, `DELETE`
- `GET/POST /networks`, `POST /networks/:id/:action` (`add-subnet|attach|detach|add-route`), `DELETE`
- `GET/POST/DELETE /primary-ips`, `POST …/assign|unassign`
- `GET/POST/DELETE /floating-ips`, `POST …/assign|unassign`
- `POST /dns/reverse` — `{ providerId, ip, ptr }`
- `GET/POST/DELETE /load-balancers`, `/placement-groups`, `/certificates`
- `POST /servers/:id/actions/:action` — reset, resize, rebuild, rescue, console, backups, labels, protect, ISO, metrics (501 stub)
- `GET /operations`, `GET /operations/:id`, `GET /parity`

## Errors

```json
{ "success": false, "error": { "code": "validation", "message": "…" } }
```

`coming_soon` / HTTP **501** = dürüst stub (metrics). Never returns decrypted API keys.
