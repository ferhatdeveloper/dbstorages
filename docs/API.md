# GraphCore — API Sözleşmesi

Base URL’ler (dev):

- Control-plane: `http://localhost:4000/api`
- Data-plane: `http://localhost:8080/api/v1`
- Frontend proxy: `/api` → Node, `/api/v1` → Go
- PostgREST (opsiyonel): `http://localhost:3001`

Ortak JSON: `{ "success": true, "data": ... }` veya `{ "success": false, "error": "..." | { code, message } }`  
Auth: `Authorization: Bearer <jwt>`

## Control-plane (Node)

| Method | Path | Durum |
|--------|------|-------|
| GET | `/health` (kök) | var — metaDb/tenantDb bayrakları |
| POST | `/auth/register` | JWT + tenant/project bootstrap |
| POST | `/auth/login` | JWT |
| POST | `/auth/logout` | var |
| GET | `/auth/me` | JWT zorunlu |
| GET | `/auth/user` | `/me` alias |
| GET | `/packages` | kiralama planları + provider listesi |
| GET | `/billing/packages` | aynı |
| POST | `/billing/checkout` | Stripe / iyzico / PayTR |
| POST | `/billing/payment-intent` | Stripe PaymentIntent |
| POST | `/billing/webhook/stripe` | raw body webhook |
| GET | `/billing/success` | ödeme sonrası instance |
| GET | `/billing/history` | JWT |
| GET/POST | `/tenants` | JWT — yalnızca membership’ler |
| GET/POST | `/projects` | JWT — tenant membership |
| GET/POST | `/instances` | JWT — membership scoped |
| GET | `/instances/:id` | JWT + membership |
| GET | `/me/memberships` | JWT |
| GET/POST/PATCH/DELETE | `/rest/:instanceId/:table` | PostgREST-compatible Data API |
| POST | `/project-auth/:instanceId/signup\|login` | müşteri Auth (instance JWT) |
| GET | `/project-auth/:instanceId/users` | platform JWT + membership |
| GET | `/db/tables` | JWT + instance membership |
| GET | `/db/tables/:table` | sayfalı CRUD okuma |
| POST/PUT/DELETE | `/db/tables/:table/rows…` | CRUD + realtime NOTIFY |
| POST | `/sql/execute` | SQL çalıştır |
| GET | `/db/schema` | şema |
| GET | `/dashboard/stats` | DB health özet |
| GET | `/connections` | kullanıcının ready instance’ları (+ restUrl) |
| POST | `/ai/sql` | OPENAI_API_KEY yoksa 503 |
| Socket.IO | `/socket.io` | auth token + `subscribe { instanceId }` |

## Data-plane (Go)

| Method | Path | Durum |
|--------|------|-------|
| GET | `/tables` | Postgres |
| GET/POST/PUT/DELETE | `/tables/:table…` | Postgres CRUD |
| POST | `/sql/execute` | Postgres |
| GET | `/files`… | boş / 501 |
| GET | `/migrations`… | boş / 501 |
| GET | `/realtime` (WS) | echo stub (tercih: Node Socket.IO) |

## Drift notları

- Table Editor öncelikle Node `/api/db` kullanır; Go yedek.
- SQL Editor: `POST /api/sql/execute` → `{ success, data: { rows, columns, rowCount, duration } }`.
- Data API: `GET /api/rest/:instanceId/:table?select=*&id=eq.1&order=id.desc&limit=10` — tam PostgREST değil (RPC/embed yok).
- Realtime: Socket.IO `auth.token` + `subscribe` room `instance:{id}`; Studio/REST yazmaları olay üretir.
