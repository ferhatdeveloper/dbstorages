# GraphCore — Mimari Karar

## Karar (P0+)

| Katman | Teknoloji | Sorumluluk |
|--------|-----------|------------|
| **Control-plane** | Node.js (`backend/node`) | Auth JWT, tenant/project/instance, paketler, Stripe/iyzico/PayTR, `/api/db` + SQL (Postgres) |
| **Data-plane** | Go (`backend/go`) | Tablo CRUD / SQL (Postgres); storage/migration sonraki |
| **REST over Postgres** | PostgREST (compose) | Opsiyonel `:3001` — kiracı demo DB |
| **Frontend** | Vite + React | Public landing/pricing; Studio `/app/*` |

**Neden Node’da da DB API var:** Go bağımlılık/CORS sorunları giderildi; yine de Studio’nun tek güvenilir yolu Node BFF üzerinden Postgres. Go paralel data-plane olarak tutulur.

## Portlar

| Servis | Port |
|--------|------|
| Frontend | 5173 |
| Node | 4000 |
| Go | 8080 |
| Postgres | 5432 |
| PostgREST | 3001 |

## Vite proxy

- `/api` → `http://localhost:4000`
- `/api/v1` → `http://localhost:8080`

## Ödeme akışı

1. Kullanıcı `/pricing` → `POST /api/billing/checkout`
2. Stripe: Checkout Session URL (key varsa) veya mock
3. Webhook (prod: `STRIPE_WEBHOOK_SECRET` imzalı) / mock başarı → `CREATE DATABASE`+`ROLE` + `instances` kaydı
4. `/billing/success` gerçek connection string gösterir
5. Studio `/api/db` kullanıcının ready instance’ına (veya `TENANT_DATABASE_URL`) bağlanır

## Bilinçli borç

- K8s / container-per-tenant yok — MVP: shared Postgres’te `CREATE DATABASE` / `ROLE`
- iyzico/PayTR SDK wire eksik (interface + env hazır; stub checkout)
- İki backend uzun vadede tek gateway
- Bu geliştirme makinesinde Docker CLI yoksa compose smoke atlanır; Dosyalar Dokploy için hazır
