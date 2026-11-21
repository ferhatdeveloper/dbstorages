# GraphCore — Kiralama Domain Modeli (stub)

> Amaç: PostgreSQL DB kiralama ürününün omurgasını sabitlemek.
> Bu aşamada **şema sözleşmesi**; kalıcı DB ve provisioning henüz yok.

## Varlıklar

```
User ──< Membership >── Tenant (Organization)
                              │
                              └── Project
                                    │
                                    └── Instance (kiralanan Postgres)
```

| Varlık | Açıklama |
|--------|----------|
| **User** | Platform hesabı (e-posta, şifre hash, ad) |
| **Tenant** | Organizasyon / faturalama birimi |
| **Membership** | User ↔ Tenant; rol: `owner` \| `admin` \| `member` |
| **Project** | Tenant altında uygulama/ortam; API anahtarları buraya bağlanır |
| **Instance** | Kiralanan Postgres sunucusu; plan, bölge, durum, bağlantı bilgisi |

## Instance durumları

`pending` → `provisioning` → `ready` → (`paused` \| `failed`) → `deleting` → `deleted`

## Plan (örnek) — `/api/packages` ile aynı

| Plan | vCPU | RAM | Disk | Bağlantı limiti | Fiyat (ay) |
|------|------|-----|------|-----------------|------------|
| free | 0.5 | 512MB | 1GB | 20 | $0 |
| pro | 2 | 4GB | 20GB | 100 | $29 |
| scale | 4 | 16GB | 100GB | 500 | $99 |

Ödeme: Stripe Checkout/PaymentIntent; TR POS: iyzico / PayTR provider interface.
Başarılı ödemede `Instance` kaydı oluşur (provisioning hâlâ local placeholder).

## Sonraki adımlar

1. Meta DB’yi docker compose ile kalıcı aç
2. Provisioning worker (local Docker Postgres spawn)
3. iyzico/PayTR gerçek SDK wire
4. Frontend onboarding + project switcher
