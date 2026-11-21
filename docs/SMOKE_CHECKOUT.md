# Mock checkout & supervisor smoke

Keys boşken (veya sandbox) yerel akış:

## Ödeme sağlayıcıları

1. Web `http://localhost:5173/pricing` açın.
2. Database planında **Kart (Stripe)** / **iyzico** / **PayTR** kartlarından birini seçin.
3. Para birimi TRY ise TR POS’ta tutar kuruşa çevrilir (FX); Stripe plan currency’sini korur.
4. **Checkout** → mock/sandbox URL veya anında `succeeded` + provision.

Beklenen:

- `POST /api/billing/checkout` body’de `provider`
- Mock’ta `data.mock: true` ve instance oluşur (aynı `payment_id` ile ikinci provision yok)
- `/billing/success` → **Console — Database** (`/database`) · Ödeme geçmişi (`/billing`)

## Console billing

- `/app` veya `http://localhost:5174/billing` — provider + durum listesi

## Supervisor

1. `SUPERVISOR_EMAIL=demo@graphcore.com` (varsayılan) ile API boot’ta role `supervisor`
2. Demo kullanıcı ile giriş → sol menü **Supervisor**
3. `/supervisor` özet, `/users`, `/tenants`, `/payments`, `/servers`
4. Ödemede **Replay provision** idempotent yeniden dener

## Webhook

- Stripe: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted` (iptalde instance `suspended`)
- iyzico: `POST /api/billing/webhook/iyzico`
- PayTR: `POST /api/billing/webhook/paytr` — yanıt gövdesi `OK`

## Sepet + domain

1. `/pricing` → plan **Sepete ekle** (ödeme yöntemleri sepette)
2. Domain mini arama veya `/domains` → müsait → sepete
3. `/cart` → Stripe/iyzico/PayTR → **Ödemeyi tamamla**
4. Mock: payment + domain_orders (`active`); plan varsa instance
5. `GET /api/domains/suggest?q=ornek` · `GET /api/domains/pricing`

## Deep-link sepet

- `/cart?plan=pro&interval=month&backup=1` → sepete yazar
- `/database` kartları → `/cart?plan=…`
- VPS `/cloud` → Cloud panel (sepet dışı)
- Kayıt sonrası `from` veya `plan` → `/cart`

