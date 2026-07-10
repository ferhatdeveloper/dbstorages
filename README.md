# GraphCore

PostgreSQL veritabanı kiralama / Supabase benzeri BaaS hedefleyen ürün.

**Dürüst durum:** Landing + paket kiralama + JWT auth + Stripe/POS soyutlama çalışır. Table/SQL Editor gerçek Postgres’e bağlanır (`docker compose` ile). Instance provisioning hâlâ placeholder (yerel `graphcore_demo`). Storage / Edge / Realtime ürün servisleri yok.

Detay: [`docs/EKSIKLER.md`](docs/EKSIKLER.md) · [`docs/DOMAIN_MODEL.md`](docs/DOMAIN_MODEL.md) · [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/API.md`](docs/API.md)

---

## Portlar

| Servis | Port |
|--------|------|
| Frontend (Vite) | 5173 |
| Node control-plane | 4000 |
| Go data-plane | 8080 |
| Postgres | 5432 |
| PostgREST (opsiyonel) | 3001 |

---

## Kurulum

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

# Opsiyonel Go data-plane
cd backend/go && go mod tidy && cd ../..
```

## Çalıştırma

```bash
npm run start:node          # :4000
npm run dev                 # :5173
# cd backend/go && go run . # :8080
```

Health: http://localhost:4000/health  
Tanıtım: http://localhost:5173/  
Paketler: http://localhost:5173/pricing  

Demo giriş: `demo@graphcore.com` / `demo123`

---

## Ödeme ortam değişkenleri

`backend/node/.env` (bkz. `env.example`):

| Değişken | Açıklama |
|----------|----------|
| `STRIPE_SECRET_KEY` | Stripe Checkout / PaymentIntent |
| `STRIPE_WEBHOOK_SECRET` | `POST /api/billing/webhook/stripe` |
| `STRIPE_PUBLISHABLE_KEY` | Frontend (ileride Elements) |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_SCALE` | Opsiyonel Price ID |
| `IYZICO_API_KEY` / `IYZICO_SECRET_KEY` | TR POS sandbox |
| `IYZICO_BASE_URL` | varsayılan sandbox API |
| `PAYTR_MERCHANT_ID` / `KEY` / `SALT` | PayTR iframe token |

Key yoksa checkout **mock URL** döner ve yerel instance kaydı yine oluşur (dev).

---

## Klasör yapısı

```
backend/go/       # Data-plane (Postgres tablo/SQL)
backend/node/     # Control-plane (auth, billing, /api/db)
docker/           # Postgres init SQL
src/              # React — landing + Studio (/app)
docs/             # Sözleşmeler ve eksikler
```
