# dbstorages

**dbstorages** — PostgreSQL veritabanı kiralama ve Supabase benzeri BaaS; kontrol düzlemi Node, paylaşımlı Postgres provisioning ve Studio konsolu. Eski iç ad: GraphCore. Tam hosted Postgres SaaS değil; MVP sınırları dokümante edilir.

**Dürüst durum:** Landing + paket kiralama + platform JWT + Stripe çalışır. Ödeme sonrası shared Postgres üzerinde `CREATE DATABASE` / `ROLE` provisioning vardır. Tenant izolasyonu (membership RBAC), instance başına PostgREST-compatible Data API (`/api/rest/:instanceId`), Socket.IO Realtime (trigger + `pg_notify`), Storage MVP (MinIO/S3 veya yerel disk), minimal project Auth ve Edge Functions worker MVP vardır. Tam Supabase parity yok (GoTrue/Storage RLS politikaları/wal2json CDC yok). iyzico/PayTR: env key ile gerçek SDK/HMAC; key yoksa mock checkout. Compose PostgREST yalnızca demo DB içindir.

Detay: [`docs/EKSIKLER.md`](docs/EKSIKLER.md) · [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/API.md`](docs/API.md)

---

## Supabase karşılaştırması (özet)

| Yetenek | Supabase | dbstorages (şimdi) |
|---------|----------|-------------------|
| Hosted Postgres | ✅ | ✅ shared multi-DB |
| Dashboard auth | ✅ | ✅ platform JWT |
| End-user Auth | GoTrue | ✅ signup/login/refresh + API keys MVP |
| Auto REST | PostgREST | ✅ uyumlu proxy (RPC + basit embed) |
| Realtime | CDC | ✅ Socket.IO + trigger NOTIFY |
| RLS | ✅ | ✅ helper template |
| Storage | ✅ | ✅ MinIO/S3 MVP + signed URL + kota |
| Edge Functions | Deno | ✅ Node worker MVP (deploy/list/invoke) |

---

## Portlar

| Servis | Port |
|--------|------|
| Marketing web (`apps/web`) | 5173 |
| Console panel (`apps/console`) | 5174 |
| nginx (prod: `/` web, `/app` console) | 80 |
| Node control-plane | 4000 |
| Go data-plane | 8080 |
| Postgres | 5432 |
| PostgREST (opsiyonel) | 3001 |
| MinIO API / Console | 9000 / 9001 |

---

## Yerel kurulum

```bash
# Postgres + PostgREST + MinIO
docker compose up -d

# Frontend monorepo (workspaces)
npm install

# Node control-plane
cd backend/node
cp env.example .env
npm install
cd ../..
```

```bash
npm run start:node          # :4000
npm run dev:web             # Marketing :5173
npm run dev:console         # Console :5174
npm run dev                 # web + console + api birlikte
```

| URL | Ne |
|-----|-----|
| http://localhost:5173 | Landing, pricing, login/register |
| http://localhost:5174 | Studio + Cloud Infrastructure (Hetzner-style) |
| http://localhost:4000/health | API |

Login marketing’te; başarılı giriş JWT ile console’a yönlendirir (`?token=`).

Demo: `demo@graphcore.com` / `demo123`

Smoke (DB gerekmez):

```bash
cd backend/node && npm test
```

---

## Dokploy / production deploy

Compose dosyası: `docker-compose.prod.yml` (web + api + postgres + postgrest + minio).

```bash
# Sunucuda / Dokploy Compose
docker compose -f docker-compose.prod.yml up -d --build
```

- **web** (nginx :80):
  - `/` → marketing SPA (`apps/web`)
  - `/app/` → console SPA (`apps/console`, Vite `base=/app/`)
  - `/api` → api proxy
- **api**: `HOST=0.0.0.0`, `NODE_PORT` / `PORT` (varsayılan 4000). `FRONTEND_ORIGIN` virgülle birden fazla origin kabul eder.
- **postgres**: meta + init.sql; provisioning aynı sunucuda yeni DB/role açar.
- **postgrest**: demo DB REST (opsiyonel).
- **minio**: Storage; S3_* env api servisine bağlanır.

Build args (opsiyonel): `VITE_WEB_URL`, `VITE_CONSOLE_URL` (örn. `https://domain.com` ve `https://domain.com/app`).

### Dokploy ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `JWT_SECRET` | evet | Production’da güçlü secret |
| `FRONTEND_ORIGIN` | evet | Public URL(lar) CORS; virgülle çoklu (marketing + console) |
| `POSTGRES_PASSWORD` | evet | Postgres şifresi |
| `DATABASE_URL` | compose set eder | Meta DB; yoksa/erişilemezse prod’da process exit |
| `STRIPE_SECRET_KEY` | ödeme için | Gerçek Checkout |
| `STRIPE_WEBHOOK_SECRET` | **prod webhook** | Yoksa production webhook 503; dev’de unsigned fallback |
| `STRIPE_PUBLISHABLE_KEY` | opsiyonel | Frontend Elements (ileride) |
| `PROVISION_PUBLIC_HOST` | önerilir | Müşteri connection string host’u |
| `PUBLIC_API_URL` | önerilir | `restUrl` / signed URL üretimi |
| `PROVISION_PUBLIC_PORT` | opsiyonel | Varsayılan 5432 |
| `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Storage | MinIO/S3; yoksa yerel `.storage` |
| `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | opsiyonel | iyzico Checkout Form (SDK) |
| `IYZICO_BASE_URL` | opsiyonel | Varsayılan sandbox API |
| `PAYTR_MERCHANT_ID` / `KEY` / `SALT` | opsiyonel | PayTR get-token + HMAC notify |
| `WEB_PUBLISH_PORT` | opsiyonel | Host’ta web portu (varsayılan 80) |

Webhook URL’leri:

- Stripe: `https://<domain>/api/billing/webhook/stripe`
- iyzico: `https://<domain>/api/billing/webhook/iyzico`
- PayTR: `https://<domain>/api/billing/webhook/paytr`

---

## Ödeme ortam değişkenleri (yerel)

`backend/node/.env` (bkz. `env.example`):

| Değişken | Açıklama |
|----------|----------|
| `STRIPE_SECRET_KEY` | Stripe Checkout / PaymentIntent |
| `STRIPE_WEBHOOK_SECRET` | Prod’da zorunlu imza doğrulama |
| `IYZICO_*` | iyzipay SDK Checkout Form (key yoksa mock) |
| `PAYTR_*` | PayTR get-token + HMAC (key yoksa mock) |

Key yoksa checkout **mock URL** döner; free/mock akışta instance yine provision edilir.

---

## Klasör yapısı

```
apps/web/         # Marketing (landing, pricing, login/register)
apps/console/     # Studio + Cloud console (Hetzner-inspired)
packages/shared/  # api client, auth/theme, vps catalog helpers
backend/go/       # Data-plane (Postgres tablo/SQL)
backend/node/     # Control-plane (auth, billing, provision, rest, storage, functions)
docker/           # Postgres init + nginx
Dockerfile        # Dual frontend (Vite → nginx: / + /app)
docker-compose.yml
docker-compose.prod.yml
docs/
```
