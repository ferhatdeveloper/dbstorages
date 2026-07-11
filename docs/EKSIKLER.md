# GraphCore — Eksik Listesi

> Hedef: PostgreSQL veritabanı kiralama platformu / Supabase benzeri BaaS.
> Bu liste abartılı “%95 tamam” veya “full Supabase parity” iddiası taşımaz.

---

## Bu oturumda tamamlananlar (2026-07 — izolasyon + Data API + Realtime MVP)

| Alan | Durum |
|------|--------|
| Tenant/RBAC: `/api/tenants|projects|instances` membership filtresi | ✅ |
| `resolveTenantPool` + Studio: auth + instance membership | ✅ |
| Process-wide `setTenantConnection` kaldırıldı → per-request pool | ✅ |
| JWT claims: `tenantId` / `projectId` (hint; SoT = memberships) | ✅ |
| PostgREST-compatible `/api/rest/:instanceId/:table` | ✅ (select/filter/CRUD) |
| Realtime: Socket.IO rooms + LISTEN/NOTIFY + Studio NOTIFY | ✅ |
| Project Auth: `auth.users` + signup/login + instance JWT secret | ✅ MVP |
| RLS helper template (`enable_rls_template.sql`) on provision | ✅ |
| Compose PostgREST (demo DB) | ✅ opsiyonel, ayrı |

**Dürüst sınır:** Tam PostgREST RPC/embed/RPC yok. Realtime CDC (wal2json) yok — Studio/REST yazmaları + NOTIFY. GoTrue/Storage/Edge yok.

---

## Önceki oturumda tamamlananlar (Dokploy kritik yol)

| Alan | Durum |
|------|--------|
| Dockerfile + `docker-compose.prod.yml` | ✅ |
| Meta DB migrate + fail-fast | ✅ |
| Per-instance provisioning (`CREATE DATABASE` / `ROLE`) | ✅ |
| Stripe webhook prod secret | ✅ |
| iyzico / PayTR | stub |

---

## P0 — Hâlâ açık

| # | Madde | Not |
|---|--------|-----|
| 1 | iyzico / PayTR gerçek SDK | Env + stub |
| 2 | K8s / container-per-tenant | Bilinçli yok |
| 3 | Full PostgREST / Realtime CDC | Kısmi MVP |
| 4 | Kota / Storage / Edge | Yok |
| 5 | GoTrue parity | Sadece signup/login JWT |

---

## 1. Ürün / Platform

- [x] Organizasyon (tenant) + register’da auto-create
- [x] Proje modeli API (membership scoped)
- [x] DB instance kiralama + shared-server provisioning
- [ ] Provisioning yaşam döngüsü (pause / delete / resize)
- [x] Gerçek connection string (per-DB)
- [x] Data API URL (`restUrl`) per instance
- [x] Faturalama iskeleti (Stripe gerçek; TR POS stub)
- [ ] Kota / limitler enforcement
- [x] Dashboard health (meta/tenant DB)
- [x] Auth ürünü (müşteri DB Auth) — minimal signup/login
- [ ] Storage / Edge
- [x] Realtime MVP (Socket.IO + NOTIFY)

---

## 2. Backend

- [x] Meta şema (`init.sql` + runtime `migrate.js` + jwt_secret/rest_url)
- [x] JWT register/login/me (+ tenant/project claims)
- [x] RBAC middleware (tenant scope / membership)
- [x] Postgres driver + per-instance pools
- [x] Table/SQL Editor API (auth zorunlu)
- [ ] Migration motoru (kiracı şema versiyonlama)
- [x] Provisioning (shared multi-DB + auth schema template)
- [ ] Storage MinIO
- [x] Stripe webhook prod path
- [x] Vite proxy / nginx `/api` + `/socket.io` proxy

---

## 3. Frontend

- [x] Landing + `/pricing` + `/billing/success` (restUrl gösterimi)
- [x] Auth + Studio `/app/*`
- [x] RealtimePage → gerçek Socket.IO
- [x] Connections → instance restUrl / projectAuthUrl
- [ ] Onboarding wizard / project switcher
- [ ] Billing history UI

---

## 4. Infra

- [x] docker-compose.yml (dev: postgres + postgrest demo)
- [x] docker-compose.prod.yml + Dockerfiles
- [ ] Bu ortamda Docker smoke
- [x] `.env.example` / `env.example`
- [ ] CI/CD
- [x] Dokploy deploy notları (README)

---

## Nasıl çalıştırılır

```bash
docker compose up -d
cd backend/node && cp env.example .env && npm install && npm start
npm install && npm run dev
```

Demo: `demo@graphcore.com` / `demo123`

### Data API örneği

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/rest/$INSTANCE_ID/users?select=*&limit=10"
```

### Project Auth örneği

```bash
curl -X POST http://localhost:4000/api/project-auth/$INSTANCE_ID/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@app.com","password":"secret123"}'
```
