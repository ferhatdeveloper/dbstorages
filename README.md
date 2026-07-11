# GraphCore

PostgreSQL veritabanı kiralama / Supabase benzeri BaaS hedefleyen ürün.

**Dürüst durum:** Landing + paket kiralama + platform JWT + Stripe çalışır. Ödeme sonrası shared Postgres üzerinde `CREATE DATABASE` / `ROLE` provisioning vardır. Tenant izolasyonu (membership RBAC), instance başına PostgREST-compatible Data API (`/api/rest/:instanceId`), Socket.IO Realtime (trigger + `pg_notify`), Storage MVP (MinIO/S3 veya yerel disk), minimal project Auth ve Edge Functions worker MVP vardır. Tam Supabase parity yok (GoTrue/Storage RLS politikaları/wal2json CDC yok). iyzico/PayTR: env key ile gerçek SDK/HMAC; key yoksa mock checkout. Compose PostgREST yalnızca demo DB içindir.

Detay: [`docs/EKSIKLER.md`](docs/EKSIKLER.md) · [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/API.md`](docs/API.md)

---

## Supabase karşılaştırması (özet)

| Yetenek | Supabase | GraphCore (şimdi) |
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
| Frontend (Vite / nginx prod) | 5173 / 80 |
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

# Frontend
npm install

# Node control-plane
cd backend/node
cp env.example .env
npm install
cd ../..
```

```bash
npm run start:node          # :4000 (HOST=0.0.0.0)
npm run dev                 # :5173
```

Health: http://localhost:4000/health  
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

- **web** (nginx :80): SPA + `/api` → api proxy — reverse-proxy (Traefik/Caddy) bunu yayınlar.
- **api**: `HOST=0.0.0.0`, `NODE_PORT` / `PORT` (varsayılan 4000).
- **postgres**: meta + init.sql; provisioning aynı sunucuda yeni DB/role açar.
- **postgrest**: demo DB REST (opsiyonel).
- **minio**: Storage; S3_* env api servisine bağlanır.

### Dokploy ortam değişkenleri

| Değişken | Zorunlu | Açıklama |
|----------|---------|----------|
| `JWT_SECRET` | evet | Production’da güçlü secret |
| `FRONTEND_ORIGIN` | evet | Public URL (CORS), örn. `https://app.example.com` |
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
backend/go/       # Data-plane (Postgres tablo/SQL)
backend/node/     # Control-plane (auth, billing, provision, rest, storage, functions)
docker/           # Postgres init + nginx
Dockerfile        # Frontend (Vite → nginx)
docker-compose.yml
docker-compose.prod.yml
src/              # React — landing + Studio (/app)
docs/
```
