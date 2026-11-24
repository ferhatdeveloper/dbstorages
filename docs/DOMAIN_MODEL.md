# dbstorages — Kiralama Domain Modeli

> PostgreSQL kiralama (BaaS) ürününün meta şema sözleşmesi.
> **Shared-server Postgres provisioning vardır** (`CREATE DATABASE` + `ROLE`); ayrı VM/container-per-tenant yok.

## Varlık grafiği

```
User ──< Membership >── Tenant (Organization)
                              │
                              ├── Project
                              │     └── Instance (kiralanan Postgres DB + role)
                              │
                              └── Payment ──< DomainOrder (opsiyonel sepet kalemi)
```

| Varlık | Açıklama |
|--------|----------|
| **User** | Platform hesabı (e-posta, şifre hash, ad) |
| **Tenant** | Organizasyon / faturalama birimi |
| **Membership** | User ↔ Tenant; rol: `owner` \| `admin` \| `member` |
| **Project** | Tenant altında uygulama/ortam; API anahtarları ve bağlantı bilgisi |
| **Instance** | Kiralanan Postgres veritabanı (shared cluster üzerinde); plan, bölge, durum, connection string |
| **Payment** | Checkout kaydı; provider (`polar`, …), tutar, metadata (plan, domain listesi) |
| **DomainOrder** | Sepete eklenen alan adı satırı; ödeme sonrası kayıt |

## Instance yaşam döngüsü (Postgres)

`pending` → `provisioning` → `ready` → (`paused` \| `failed`) → `deleting` → `deleted`

- **Provisioning:** `backend/node/lib/provision.js` — paylaşımlı Postgres’te `CREATE DATABASE` + dedicated `ROLE`.
- Admin DB erişilemezse kontrollü **demo/fallback** connection string (geliştirme modu).

## Ödeme ve fulfillment

| Aşama | Davranış |
|-------|----------|
| Checkout başarılı | `Payment` güncellenir; instance provisioning tetiklenir (plan varsa). |
| Polar webhook | `order.paid` / `subscription.active` → `fulfillPayment` → instance `ready` yoluna girer. |
| Mock checkout (key yok) | Aynı akış; provider mock URL ile simüle edilir. |

**Varsayılan ödeme:** Polar (Merchant of Record). Lemon Squeezy / Stripe / iyzico / PayTR kodda var; env ile çoğu **kapalı** (`PAYMENTS_DISABLED`).

## Domain (registrar) — mock

Alan adı sepeti ve fiyat kataloğu (`backend/node/lib/domains.js`) vardır:

- Müsaitlik: **mock** (SHA tabanlı “dolu/boş” + reserved liste); gerçek registrar API’si zorunlu değil.
- DNS `resolve` yalnızca yardımcı doğrulama; production registrar entegrasyonu yok.

**DomainOrder durumları:**

| Durum | Ne zaman |
|-------|----------|
| `pending_fulfillment` | Varsayılan (mock ödeme dahil). Kayıt kurumu bağlı değilken sipariş **beklemede ve manuel** işlenir. |
| `active` | Yalnızca `DOMAIN_REGISTRAR_ENABLED=1` iken (otomatik kayıt). |

Ödeme metadata’sındaki `domains[]` dizisi `fulfillDomainOrders` ile meta DB’de `domain_orders` tablosuna yazılır.

## Plan (örnek) — `/api/packages` ile uyumlu

| Plan | vCPU | RAM | Disk | Bağlantı limiti | Fiyat (ay) |
|------|------|-----|------|-----------------|------------|
| free | 0.5 | 512MB | 1GB | 20 | $0 |
| pro | 2 | 4GB | 20GB | 100 | $29 |
| scale | 4 | 16GB | 100GB | 500 | $99 |

Plan satın alımı → Instance provisioning. Domain satırları → `DomainOrder` (registrar mock / `pending_fulfillment`).

## Bilinçli sınırlar (model dışı / ertelenmiş)

- K8s veya container-per-tenant izolasyonu
- Gerçek domain registrar (transfer, WHOIS, glue kayıtları)
- wal2json / logical replication CDC (Realtime = trigger + `NOTIFY`)

Detaylı gap listesi: [`EKSIKLER.md`](./EKSIKLER.md)