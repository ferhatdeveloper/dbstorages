# GraphCore

PostgreSQL veritabanı kiralama / Supabase benzeri BaaS hedefleyen ürün.

**Dürüst durum:** Landing + paket kiralama + platform JWT + Stripe çalışır. Ödeme sonrası shared Postgres üzerinde `CREATE DATABASE` / `ROLE` provisioning vardır. **Tenant izolasyonu (membership RBAC)**, instance başına **PostgREST-compatible Data API** (`/api/rest/:instanceId`), **Socket.IO Realtime MVP** ve **minimal project Auth** (`auth.users` + JWT) vardır. Tam Supabase parity yok (GoTrue/Storage/Edge/CDC yok). iyzico/PayTR hâlâ stub. Compose PostgREST yalnızca demo DB içindir.

Detay: [`docs/EKSIKLER.md`](docs/EKSIKLER.md) · [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/API.md`](docs/API.md)

---

## Supabase karşılaştırması (özet)

| Yetenek | Supabase | GraphCore (şimdi) |
|---------|----------|-------------------|
| Hosted Postgres | ✅ | ✅ shared multi-DB |
| Dashboard auth | ✅ | ✅ platform JWT |
| End-user Auth | GoTrue | ✅ minimal signup/login + JWT |
| Auto REST | PostgREST | ✅ uyumlu proxy (kısmi) |
| Realtime | CDC | ✅ Socket.IO + NOTIFY MVP |
| RLS | ✅ | ✅ helper template |
| Storage / Edge | ✅ | ❌ |

---

## Portlar

| Servis | Port |
|--------|------|
| Frontend (Vite / nginx prod) | 5173 / 80 |
| Node control-plane | 4000 |
| Go data-plane | 8080 |
| Postgres | 5432 |
| PostgREST (opsiyonel) | 3001 |

---

## Yerel kurulum

```bash
# Postgres + PostgREST
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

---

## Dokploy / production deploy

Compose dosyası: `docker-compose.prod.yml` (web + api + postgres + postgrest).

```bash
# Sunucuda / Dokploy Compose
docker compose -f docker-compose.prod.yml up -d --build
```

- **web** (nginx :80): SPA + `/api` → api proxy — reverse-proxy (Traefik/Caddy) bunu yayınlar.
- **api**: `HOST=0.0.0.0`, `NODE_PORT` / `PORT` (varsayılan 4000).
- **postgres**: meta + init.sql; provisioning aynı sunucuda yeni DB/role açar.
- **postgrest**: demo DB REST (opsiyonel).

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
| `PUBLIC_API_URL` | önerilir | `restUrl` üretimi (örn. `https://api.example.com`) |
| `PROVISION_PUBLIC_PORT` | opsiyonel | Varsayılan 5432 |
| `IYZICO_*` / `PAYTR_*` | opsiyonel | TR POS — hâlâ stub |
| `WEB_PUBLISH_PORT` | opsiyonel | Host’ta web portu (varsayılan 80) |

Stripe webhook URL: `https://<domain>/api/billing/webhook/stripe`

---

## Ödeme ortam değişkenleri (yerel)

`backend/node/.env` (bkz. `env.example`):

| Değişken | Açıklama |
|----------|----------|
| `STRIPE_SECRET_KEY` | Stripe Checkout / PaymentIntent |
| `STRIPE_WEBHOOK_SECRET` | Prod’da zorunlu imza doğrulama |
| `IYZICO_*` / `PAYTR_*` | TR POS stub (env hazır, SDK wire yok) |

Key yoksa checkout **mock URL** döner; free/mock akışta instance yine provision edilir.

---

## Klasör yapısı

```
backend/go/       # Data-plane (Postgres tablo/SQL)
backend/node/     # Control-plane (auth, billing, provision, /api/db)
docker/           # Postgres init + nginx
Dockerfile        # Frontend (Vite → nginx)
docker-compose.yml
docker-compose.prod.yml
src/              # React — landing + Studio (/app)
docs/
```
