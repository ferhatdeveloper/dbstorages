# GraphCore — Eksik Listesi

> Hedef: PostgreSQL veritabanı kiralama platformu / Supabase benzeri BaaS.
> Bu liste abartılı “%95 tamam” iddiasını taşımaz.

---

## Bu oturumda tamamlananlar (2026-07 — Dokploy kritik yol)

| Alan | Durum |
|------|--------|
| Dockerfile frontend (Vite + nginx) + Node API | ✅ |
| `docker-compose.prod.yml` (web + api + postgres + postgrest) | ✅ |
| Reverse-proxy friendly (`HOST=0.0.0.0`, `PORT`/`NODE_PORT`) | ✅ |
| README Dokploy env tablosu | ✅ |
| Meta DB: `ensureMetaSchema` + `DATABASE_URL` prod’da fail-fast | ✅ |
| Per-instance provisioning (`CREATE DATABASE` / `ROLE`) | ✅ |
| Studio tenant pool → provisioned instance | ✅ |
| Stripe webhook: prod’da `STRIPE_WEBHOOK_SECRET` zorunlu | ✅ |
| iyzico / PayTR | stub (env hazır, SDK wire yok — Dokploy’u bloklamaz) |

**Çalıştırma notu (bu makine):** Docker CLI yok → `docker compose` smoke burada koşturulamadı. Dosyalar Dokploy/sunucu için hazır. Yerel doğrulama: `npm run build` + Node module require.

---

## Önceki oturumda tamamlananlar

| Alan | Durum |
|------|--------|
| Portlar (Vite 5173 / Node 4000 / Go 8080) | ✅ |
| Landing + paketler UI | ✅ |
| Register / Login JWT | ✅ (meta DB yoksa in-memory, yalnızca dev) |
| Stripe Checkout + PaymentIntent | ✅ |
| Node `/api/db/*` + SQL | ✅ |
| Go data-plane + CORS | ✅ |
| docker-compose (Postgres + PostgREST) | ✅ |

---

## P0 — Hâlâ açık / stub

| # | Madde | Not |
|---|--------|-----|
| 1 | iyzico / PayTR gerçek SDK | Env + stub URL; HTTP initialize yok |
| 2 | K8s / container-per-tenant | Bilinçli olarak yok; shared multi-DB MVP yeterli |
| 3 | Bu ortamda Docker smoke | Docker CLI kurulu değil |
| 4 | Go gateway birleştirme | Opsiyonel |
| 5 | Kota / RBAC / Storage / Edge / Realtime | Sonraki |

---

## 1. Ürün / Platform

- [x] Organizasyon (tenant) + register’da auto-create
- [x] Proje modeli API
- [x] DB instance kiralama + shared-server provisioning
- [ ] Provisioning yaşam döngüsü (pause / delete / resize)
- [x] Gerçek connection string (per-DB)
- [x] Faturalama iskeleti (Stripe gerçek; TR POS stub)
- [ ] Kota / limitler enforcement
- [x] Dashboard health (meta/tenant DB)
- [ ] Auth ürünü (müşteri DB Auth)
- [ ] Storage / Edge / Realtime

---

## 2. Backend

- [x] Meta şema (`init.sql` + runtime `migrate.js`)
- [x] JWT register/login/me
- [ ] RBAC middleware (tenant scope)
- [x] Postgres driver
- [x] Table/SQL Editor API
- [ ] Migration motoru (kiracı şema versiyonlama)
- [x] Provisioning (shared multi-DB)
- [ ] Storage MinIO
- [x] Stripe webhook prod path
- [x] Vite proxy / nginx `/api` proxy

---

## 3. Frontend

- [x] Landing + `/pricing` + `/billing/success`
- [x] Auth + Studio `/app/*`
- [ ] Onboarding wizard / project switcher
- [ ] Billing history UI

---

## 4. Infra

- [x] docker-compose.yml (dev: postgres + postgrest)
- [x] docker-compose.prod.yml + Dockerfiles
- [ ] Bu ortamda Docker smoke
- [x] `.env.example` / `env.example`
- [ ] CI/CD
- [x] Dokploy deploy notları (README)

---

## Nasıl çalıştırılır

```bash
# Dev data
docker compose up -d

# Prod-benzeri (Dokploy)
docker compose -f docker-compose.prod.yml up -d --build

cd backend/node && cp env.example .env && npm install && npm start
npm install && npm run dev
```

Demo: `demo@graphcore.com` / `demo123`
