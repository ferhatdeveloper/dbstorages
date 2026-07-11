# GraphCore — Eksik Listesi

> Hedef: PostgreSQL veritabanı kiralama platformu / Supabase benzeri BaaS.
> Bu liste abartılı “%95 tamam” veya “full Supabase parity” iddiası taşımaz.

---

## Bu oturumda tamamlananlar (2026-07 — Storage + Realtime CDC + TR POS)

| Alan | Durum |
|------|--------|
| MinIO (S3) `docker-compose.yml` + `docker-compose.prod.yml` | ✅ |
| Storage API `/api/storage/:instanceId/*` (list/upload/download/folder/delete) | ✅ |
| Instance-scoped bucket `gc-{instanceId}`; S3 yoksa yerel `.storage` fallback | ✅ |
| StoragePage → gerçek API (mock kaldırıldı) | ✅ |
| Realtime CDC: provision + listener’da AFTER ROW trigger → `pg_notify` | ✅ |
| Studio/REST yazmaları trigger üzerinden RealtimePage’e düşer | ✅ |
| iyzico Checkout Form (`iyzipay` SDK) + `/api/billing/webhook/iyzico` | ✅ env key ile |
| PayTR get-token + `/api/billing/webhook/paytr` | ✅ env key ile |
| Stripe Checkout (önceki oturum) | ✅ korunuyor |

**Dürüst sınır:** Full Supabase Storage (CDN/image transform/RLS policies) yok. Realtime hâlâ wal2json/logical replication değil — trigger+NOTIFY. Edge Functions / GoTrue parity yok. TR POS sandbox’ta merchant hesabı + public callback URL gerekir.

### Kardeş repo incelemesi (reuse kararı)

| Repo | Sonuç | Not |
|------|--------|-----|
| [api_servis](https://github.com/ferhatdeveloper/api_servis) | **Doğrudan reuse yok** | FastAPI domain; TenantManager fikri zaten `resolveTenantPool` ile karşılanıyor. |
| [Berqenas](https://github.com/ferhatdeveloper/Berqenas) | **Doğrudan reuse yok** | Bu sprint’te bilinçli skip. |

---

## Önceki oturumda tamamlananlar (izolasyon + Data API + Realtime MVP)

| Alan | Durum |
|------|--------|
| Tenant/RBAC membership | ✅ |
| PostgREST-compatible `/api/rest` | ✅ |
| Realtime Socket.IO + LISTEN/NOTIFY | ✅ → CDC trigger ile güçlendirildi |
| Project Auth signup/login | ✅ MVP |
| Compose PostgREST (demo) | ✅ |

---

## P0 — Hâlâ açık

| # | Madde | Not |
|---|--------|-----|
| 1 | K8s / container-per-tenant | Bilinçli yok (shared multi-DB) |
| 2 | Full PostgREST (RPC/embed) + wal2json CDC | Kısmi |
| 3 | Kota / Storage RLS / signed URLs | Kota yok; Storage MVP only |
| 4 | GoTrue parity | Sadece signup/login JWT |
| 5 | Edge Functions | Yok |
| 6 | Provisioning pause/delete/resize | Yok |

---

## 1. Ürün / Platform

- [x] Organizasyon (tenant) + register’da auto-create
- [x] Proje modeli API (membership scoped)
- [x] DB instance kiralama + shared-server provisioning
- [ ] Provisioning yaşam döngüsü (pause / delete / resize)
- [x] Gerçek connection string (per-DB)
- [x] Data API URL (`restUrl`) per instance
- [x] Faturalama: Stripe gerçek; iyzico/PayTR SDK (env key)
- [ ] Kota / limitler enforcement
- [x] Dashboard health (meta/tenant DB)
- [x] Auth ürünü (müşteri DB Auth) — minimal signup/login
- [x] Storage MVP (MinIO / local)
- [ ] Edge Functions
- [x] Realtime (Socket.IO + trigger NOTIFY)

---

## 2. Backend

- [x] Meta şema + migrate
- [x] JWT register/login/me
- [x] RBAC middleware
- [x] Postgres driver + per-instance pools
- [x] Table/SQL Editor API
- [ ] Migration motoru (kiracı şema versiyonlama)
- [x] Provisioning + auth + realtime trigger templates
- [x] Storage MinIO / S3 routes
- [x] Stripe + iyzico + PayTR webhook paths
- [x] Vite proxy / nginx `/api` + `/socket.io`

---

## 3. Frontend

- [x] Landing + `/pricing` + `/billing/success`
- [x] Auth + Studio `/app/*`
- [x] RealtimePage → Socket.IO + DB yazma olayları
- [x] StoragePage → API (instance seçici)
- [x] Connections → restUrl / projectAuthUrl
- [ ] Onboarding wizard / project switcher
- [ ] Billing history UI

---

## 4. Infra

- [x] docker-compose.yml (postgres + postgrest + minio)
- [x] docker-compose.prod.yml (+ minio + S3 env)
- [ ] Bu ortamda Docker smoke
- [x] `.env.example` / `env.example` (S3 + TR POS dokümante)
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

### Storage

```bash
# MinIO console: http://localhost:9001 (minioadmin / minioadmin)
# API: S3_ENDPOINT=http://localhost:9000
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/storage/$INSTANCE_ID/objects"
```

S3 env yoksa dosyalar `backend/node/.storage/` altına yazılır.

### Realtime CDC

Provision sırasında (ve listener açılışında) `public` tablolara AFTER ROW trigger + `pg_notify('graphcore_changes')` uygulanır. Studio/REST/SQL yazmaları RealtimePage’de görünür. Yeni tabloda event trigger yoksa: `SELECT graphcore_attach_realtime_triggers();`

### Data API örneği

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/rest/$INSTANCE_ID/users?select=*&limit=10"
```
