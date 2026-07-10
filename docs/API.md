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
| GET/POST | `/tenants` | var |
| GET/POST | `/projects` | var |
| GET/POST | `/instances` | var |
| GET | `/db/tables` | gerçek Postgres introspection |
| GET | `/db/tables/:table` | sayfalı CRUD okuma |
| POST/PUT/DELETE | `/db/tables/:table/rows…` | CRUD |
| POST | `/sql/execute` | SQL çalıştır |
| GET | `/db/schema` | şema |
| GET | `/dashboard/stats` | DB health özet |
| GET | `/connections` | tenant bağlantı listesi |
| POST | `/ai/sql` | OPENAI_API_KEY yoksa 503 |

## Data-plane (Go)

| Method | Path | Durum |
|--------|------|-------|
| GET | `/tables` | Postgres |
| GET/POST/PUT/DELETE | `/tables/:table…` | Postgres CRUD |
| POST | `/sql/execute` | Postgres |
| GET | `/files`… | boş / 501 |
| GET | `/migrations`… | boş / 501 |
| GET | `/realtime` (WS) | echo stub |

## Drift notları

- Table Editor öncelikle Node `/api/db` kullanır; Go yedek.
- SQL Editor: `POST /api/sql/execute` → `{ success, data: { rows, columns, rowCount, duration } }`.
