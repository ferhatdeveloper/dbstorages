# GraphCore — Eksik Listesi

> Hedef: PostgreSQL veritabanı kiralama platformu / Supabase benzeri BaaS.
> Bu liste abartılı “%95 tamam” iddiasını taşımaz. Aşağıda **bu oturumda tamamlananlar** ve **hâlâ eksikler** ayrılmıştır.

---

## Bu oturumda tamamlananlar (2026-07)

| Alan | Durum |
|------|--------|
| Portlar (Vite 5173 / Node 4000 / Go 8080) | ✅ |
| Landing (tanıtım) + paketler UI | ✅ |
| Register / Login JWT (bcrypt + imza) | ✅ (meta DB yoksa in-memory) |
| Stripe Checkout + PaymentIntent yolu | ✅ (env key ile gerçek; yoksa mock URL) |
| POS soyutlama: iyzico + PayTR sandbox stub | ✅ |
| Ödeme sonrası Instance kaydı + connection placeholder | ✅ |
| Node `/api/db/*` + `/api/sql/execute` (gerçek Postgres) | ✅ kod hazır |
| Go data-plane gerçek Postgres + CORS fix | ✅ kod hazır |
| docker-compose (Postgres + PostgREST :3001) | ✅ dosya var |
| Schema sayfası canlı introspection | ✅ |
| API client hizalama (`success`/`data`) | ✅ kısmen |
| Dürüst README / EKSIKLER | ✅ |

**Çalıştırma notu (bu makine):** Docker CLI yoktu; yerel 5432’de `graphcore` kullanıcısı reddedildi → `metaDb=false`, `tenantDb=false`. Control-plane (auth/billing) in-memory ile smoke geçti. Table/SQL için: `docker compose up -d` ile `graphcore`/`graphcore` credential’lı Postgres şart.

---

## P0 — Hâlâ açık

| # | Madde | Not |
|---|--------|-----|
| 1 | Meta DB kalıcılığı | `docker compose` ile açılınca Node `DATABASE_URL` kullanır; migration seed `init.sql` |
| 2 | Gerçek instance provisioning | Ödeme sonrası hâlâ yerel `graphcore_demo` placeholder |
| 3 | Stripe webhook prod doğrulama | `STRIPE_WEBHOOK_SECRET` ile; yoksa dev fallback |
| 4 | iyzico / PayTR gerçek SDK çağrıları | Yapı + env hazır; API wire sonraki adım |
| 5 | Go derleme CI + tek gateway | Go derlenebilir; uzun vadede gateway |

---

## 1. Ürün / Platform

- [x] Organizasyon (tenant) stub + register’da auto-create
- [x] Proje modeli API
- [x] DB instance kiralama (plan + kayıt; provisioning stub)
- [ ] Provisioning yaşam döngüsü (Docker spawn / pause / delete)
- [x] Bağlantı bilgisi (placeholder connection string)
- [x] Faturalama iskeleti (Stripe + TR POS interface)
- [ ] Kota / limitler enforcement
- [x] Dashboard health (meta/tenant DB durumu)
- [ ] Auth ürünü (müşteri DB’si için Supabase Auth)
- [ ] Storage / Edge / Realtime ürünleri (UI var, servis yok — dürüst 501/boş)

---

## 2. Backend

- [x] Meta şema (`docker/postgres/init.sql`)
- [x] JWT register/login/me
- [ ] RBAC middleware (tenant scope)
- [x] Postgres driver (Node `pg` + Go `lib/pq`)
- [x] Table/SQL Editor API (Node `/api/db`, Go `/api/v1`)
- [ ] Migration motoru
- [ ] Connection manager / vault
- [ ] Provisioning worker
- [ ] Storage MinIO
- [ ] AI SQL (OPENAI_API_KEY yoksa 503 — dürüst)
- [x] Go CORS / derlenebilirlik düzeltmesi
- [x] Vite proxy tek giriş

---

## 3. Frontend

- [x] Landing + `/pricing` + `/billing/success`
- [x] `/register` route
- [x] Auth token saklama + ProtectedRoute
- [x] Studio `/app/*` prefix
- [x] Table/SQL/Schema → gerçek API sözleşmesi
- [ ] Onboarding wizard (org → project → provision)
- [ ] Project switcher
- [ ] Billing history UI
- [ ] Storage/Auth/Functions: dürüst empty (kısmen)

---

## 4. Infra

- [x] docker-compose.yml (postgres + postgrest)
- [ ] Bu ortamda Docker kurulumu / compose smoke
- [x] `.env.example` (kök + `backend/node`)
- [ ] CI/CD
- [ ] Deploy / metrics

---

## Bilinçli olarak sonraya bırakılanlar

Supabase parity (RLS editor, GraphQL, vector, branching, multi-region) P0 değil.

---

## Nasıl çalıştırılır (özet)

```bash
docker compose up -d
cd backend/node && cp env.example .env && npm install && npm start
# opsiyonel: cd backend/go && go run .
npm install && npm run dev   # :5173
```

Demo: `demo@graphcore.com` / `demo123`  
Ödeme: `STRIPE_SECRET_KEY` (yoksa mock checkout). TR: `IYZICO_*`, `PAYTR_*`.
