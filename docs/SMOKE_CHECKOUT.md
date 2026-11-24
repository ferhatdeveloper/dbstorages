# Mock checkout & supervisor smoke

Keys boşken (veya sandbox) yerel akış:

## Ödeme sağlayıcıları

**Birincil:** Polar (kart) · **Kripto:** NOWPayments (USDT vb.)  
**Pasif (varsayılan `PAYMENTS_DISABLED`):** Stripe, iyzico, PayTR, Lemon Squeezy

1. Web `http://localhost:5173/database` açın.
2. Sepette **Kart (Polar)** veya **Kripto (USDT)** seçin.
3. Para birimi TRY ise yalnızca TR POS (iyzico/PayTR — kapalıyken kullanılmaz) için FX; Polar katalog USD/EUR tutarını kullanır.
4. **Checkout** → Polar mock/sandbox URL, NOWPayments faturası veya anında `succeeded` + provision.

Beklenen:

- `POST /api/billing/checkout` — body’de `provider` (varsayılan `polar`)
- Polar/NOWPayments key yokken `data.mock: true` (crypto: defer + `/billing/crypto` onayı)
- Aynı `payment_id` ile ikinci provision yok
- `/billing/success` → **Console — Database** (`/database`) · Ödeme geçmişi (`/billing`)

## Console billing

- `/app` veya `http://localhost:5174/billing` — provider + durum listesi

## Supervisor

1. `SUPERVISOR_EMAIL=demo@graphcore.com` (varsayılan) ile API boot’ta role `supervisor`
2. Demo kullanıcı ile giriş → sol menü **Supervisor**
3. `/supervisor` özet, `/users`, `/tenants`, `/payments`, `/servers`
4. Ödemede **Replay provision** idempotent yeniden dener

## Webhook

- **Polar (birincil):** `POST /api/billing/webhook/polar` — `order.paid` / `subscription.active` → provision; `subscription.canceled` / `subscription.revoked` / `subscription.past_due` → instance `suspended`
- Kripto: `POST /api/billing/webhook/crypto` (NOWPayments IPN)
- Stripe / iyzico / PayTR — `PAYMENTS_DISABLED` ile kapalı; açılırsa: Stripe `customer.subscription.deleted`, iyzico `POST /api/billing/webhook/iyzico`, PayTR `POST /api/billing/webhook/paytr` (gövde `OK`)

## Sepet + domain

1. `/database` → plan **Sepete ekle** (ödeme yöntemleri sepette)
2. Domain mini arama veya `/domains` → müsait → sepete
3. `/cart` → Polar (kart) veya kripto → **Ödemeyi tamamla**
4. Mock: payment + domain_orders (`pending_fulfillment`, manuel); plan varsa instance
5. `GET /api/domains/suggest?q=ornek` · `GET /api/domains/pricing`

## Deep-link sepet

- `/cart?plan=pro&interval=month&backup=1` → sepete yazar
- `/database` kartları → `/cart?plan=…`
- VPS `/cloud` → Console Cloud only (not Polar / web cart). Polar checkout accepts database, backup storage, and domains only.
- Kayıt sonrası `from` veya `plan` → `/cart`