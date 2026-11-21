# WireGuard VPN (ek hizmet)

Güvenli erişim add-on’u: provision edilen VPS / Windows sunuculara RDP (3389) veya SSH öncesi WireGuard tüneli.

## Fiyat (kullanıcı başına)

| | |
|--|--|
| Model | **Per user / peer** (aktif peer = 1 kullanıcı) |
| Birim | **€5.99 / kullanıcı / ay** (yıllık €71.88 / kullanıcı) |
| Örnek | 3 kullanıcı × €5.99 = **€17.97/ay** |
| Para birimi | **EUR** (VPS kataloğu ile uyumlu) |
| DB planları | Pro / Scale / Max **değişmez** |
| Yedekleme | $10/ay — ayrı |
| VPS | Hetzner × 1.20 — ayrı |

Checkout’ta DB planıyla karıştırılmaz (`contactOnly`); Studio → **Cloud → VPN / WireGuard** üzerinden açılır. `quantity` = aktif peer sayısı (abonelik / addon takibi).

## Akış (RDP)

1. Studio’da VPN ek hizmetini açın (veya peer oluştururken otomatik enable).
2. Peer oluşturun; her peer **+€5.99/ay** ekler — panelde `X kullanıcı × €5.99 = €Z/ay` görünür.
3. `.conf` indirin veya QR tarayın → WireGuard istemcisine aktarın.
4. Bağlanın; ardından `mstsc` / RDP ile sunucu IP:3389 (Administrator).
5. Mümkünse firewall’da 3389’u yalnızca VPN subnet’ine (`10.66.0.0/24`) açın.

## API

| Method | Path | Not |
|--------|------|-----|
| GET | `/api/cloud/vpn/status` | Addon + `billing` (`seats`, `label`, `quantity`) + peers |
| POST | `/api/cloud/vpn/enable` | Tenant ağı oluştur |
| GET | `/api/cloud/vpn/peers` | Peer listesi |
| POST | `/api/cloud/vpn/peers` | `{ name, serverId? }` → `billing` + `billingDelta` |
| GET | `/api/cloud/vpn/peers/:id/config` | Config JSON (`?download=1` → `.conf`) |
| GET | `/api/cloud/vpn/peers/:id/qr` | PNG QR |
| DELETE | `/api/cloud/vpn/peers/:id` | Revoke (seat sayısı düşer) |

Auth + tenant membership zorunlu (diğer Cloud route’ları gibi).

## Ortam

```env
WIREGUARD_ENDPOINT=vpn.example.com:51820
WIREGUARD_SERVER_PUBLIC_KEY=<base64>
WIREGUARD_SUBNET=10.66.0.0/24
WIREGUARD_DNS=1.1.1.1
WIREGUARD_USE_WG=0
```

Endpoint + server public key yoksa **mock** mod: client config yine üretilir; gerçek tünel için env gerekir. Anahtar üretimi Node `crypto` X25519 (Windows’ta `wg` şart değil).

## UI

- Landing → `#cloud-vpn`
- Pricing → `#vpn-addon`
- Studio → Cloud → **VPN / WireGuard** (faturalandırılabilir kullanıcılar + maliyet uyarısı)
- Sunucu detay checklist: **VPN ile bağlan** (Windows RDP adımı)
