# GraphCore — Eksik Listesi

> Hedef: PostgreSQL veritabanı kiralama platformu / Supabase benzeri BaaS.
> Bu liste abartılı “%95 tamam” veya “full Supabase parity” iddiası taşımaz.

---

## Bu oturumda tamamlananlar (2026-07-11 — P0 backlog MVP)

| Alan | Durum |
|------|--------|
| README / Dokploy env sync (Storage + iyzico/PayTR SDK) | ✅ |
| Storage kota (plan `storageGb`) + signed download URL | ✅ |
| Edge Functions Node VM MVP (deploy/list/invoke) | ✅ |
| Project Auth: refresh token, anon/service_role keys, password reset stub | ✅ |
| Provisioning pause / resume / soft+hard delete / soft resize | ✅ |
| REST: RPC + bir seviye embed (`select=id,orders(id)`) | ✅ |
| Realtime: payload truncate + wal2json limit dokümante | ✅ (logical CDC yok) |
| Migration motor (`_graphcore_migrations` + API + Studio) | ✅ |
| Project switcher (sidebar) | ✅ |
| Billing history UI (`/app/billing`) | ✅ |
| Smoke tests + GitHub Actions CI | ✅ |

**Dürüst sınır:** K8s/container-per-tenant yok. wal2json/logical replication yok (trigger+NOTIFY). Storage RLS policy motoru yok (instance-scoped bucket + kota). Edge = Node `vm`, Deno değil. Resize plan etiketi/kota; cgroup yok. Password reset e-posta göndermez (token API’de).

---

## Önceki oturum (Storage + Realtime CDC + TR POS)

| Alan | Durum |
|------|--------|
| MinIO + Storage API + Studio | ✅ |
| Trigger → `pg_notify` CDC | ✅ |
| iyzico / PayTR SDK + Stripe | ✅ |

### Kardeş repo incelemesi

| Repo | Sonuç |
|------|--------|
| api_servis / Berqenas | Doğrudan reuse yok |

---

## P0 — Kalan / bilinçli ertelenen

| # | Madde | Not |
|---|--------|-----|
| 1 | K8s / container-per-tenant | Bilinçli yok (shared multi-DB) |
| 2 | wal2json / logical CDC | Erteleme — trigger NOTIFY güçlendirildi |
| 3 | Full Storage RLS policies / CDN / image transform | Yok |
| 4 | Deno Edge + network sandbox | Node VM MVP yeterli şimdilik |
| 5 | Hard resource resize (cgroup/RAM) | Soft plan label only |

---

## 1. Ürün / Platform

- [x] Organizasyon (tenant) + register’da auto-create
- [x] Proje modeli API (membership scoped)
- [x] DB instance kiralama + shared-server provisioning
- [x] Provisioning yaşam döngüsü (pause / delete / resize)
- [x] Gerçek connection string (per-DB)
- [x] Data API URL (`restUrl`) per instance
- [x] Faturalama: Stripe gerçek; iyzico/PayTR SDK (env key)
- [x] Kota / limitler enforcement (storage quota MVP)
- [x] Dashboard health (meta/tenant DB)
- [x] Auth ürünü — signup/login/refresh/keys/reset stub
- [x] Storage MVP (MinIO / local) + signed URL
- [x] Edge Functions (Node VM MVP)
- [x] Realtime (Socket.IO + trigger NOTIFY)

---

## 2. Backend

- [x] Meta şema + migrate
- [x] JWT register/login/me
- [x] RBAC middleware
- [x] Postgres driver + per-instance pools
- [x] Table/SQL Editor API
- [x] Migration motoru (kiracı şema versiyonlama)
- [x] Provisioning + auth + realtime trigger templates
- [x] Storage MinIO / S3 routes
- [x] Stripe + iyzico + PayTR webhook paths
- [x] Vite proxy / nginx `/api` + `/socket.io`
- [x] REST RPC + embed
- [x] Functions + migrations routes
- [x] CI smoke (`npm test` in `backend/node`)

---

## 3. Frontend

- [x] Landing + `/pricing` + `/billing/success`
- [x] Auth + Studio `/app/*`
- [x] RealtimePage → Socket.IO + DB yazma olayları
- [x] StoragePage → API (instance seçici)
- [x] Connections → restUrl / projectAuthUrl
- [x] Project switcher
- [x] Billing history UI
- [x] Edge Functions / Migration gerçek API

---

## 4. Infra

- [x] docker-compose.yml (postgres + postgrest + minio)
- [x] docker-compose.prod.yml (+ minio + S3 env)
- [ ] Bu ortamda Docker smoke (makine/CLI’ye bağlı)
- [x] `.env.example` / `env.example`
- [x] CI/CD (GitHub Actions)
- [x] Dokploy deploy notları (README)

---

## Nasıl çalıştırılır

```bash
docker compose up -d
cd backend/node && cp env.example .env && npm install && npm start
npm install && npm run dev
```

Demo: `demo@graphcore.com` / `demo123`

```bash
# Smoke (DB gerekmez)
cd backend/node && npm test
npm run build
```

### Storage signed URL

```bash
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"key":"file.txt","expiresIn":900}' \
  "http://localhost:4000/api/storage/$INSTANCE_ID/sign"
# → data.url  (GET, auth yok)
```

### Edge Functions

```bash
curl -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"source":"module.exports=async(req)=>({status:200,body:{ok:true}})"}' \
  "http://localhost:4000/api/functions/$INSTANCE_ID/hello"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"body":{"x":1}}' \
  "http://localhost:4000/api/functions/$INSTANCE_ID/hello/invoke"
```

### Realtime CDC

Trigger + `pg_notify('graphcore_changes')`. wal2json yok. Yeni tablo: `SELECT graphcore_attach_realtime_triggers();`

### Data API / RPC

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/rest/$INSTANCE_ID/users?select=id,email&limit=10"
curl -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{}' "http://localhost:4000/api/rest/$INSTANCE_ID/rpc/graphcore_attach_realtime_triggers"
```
