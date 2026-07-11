# WireGuard VPN (ek hizmet)

Güvenli erişim add-on’u: provision edilen VPS / Windows sunuculara RDP (3389) veya SSH öncesi WireGuard tüneli.

## Fiyat

| | |
|--|--|
| Perakende | **€5.99 / ay** (yıllık €71.88) |
| Para birimi | **EUR** (VPS kataloğu ile uyumlu) |
| DB planları | Pro / Scale / Max **değişmez** |
| Yedekleme | $10/ay — ayrı |
| VPS | Hetzner × 1.20 — ayrı |

Checkout’ta DB planıyla karıştırılmaz (`contactOnly`); Studio → **Cloud → VPN / WireGuard** üzerinden açılır.

## Akış (RDP)

1. Studio’da VPN ek hizmetini açın (veya peer oluştururken otomatik enable).
2. Peer oluşturun; isteğe bağlı sunucu seçin (AllowedIPs’e IP eklenir).
3. `.conf` indirin veya QR tarayın → WireGuard istemcisine aktarın.
4. Bağlanın; ardından `mstsc` / RDP ile sunucu IP:3389 (Administrator).
5. Mümkünse firewall’da 3389’u yalnızca VPN subnet’ine (`10.66.0.0/24`) açın.

## API

| Method | Path | Not |
|--------|------|-----|
| GET | `/api/cloud/vpn/status` | Addon fiyat + network + peers |
| POST | `/api/cloud/vpn/enable` | Tenant ağı oluştur |
| GET | `/api/cloud/vpn/peers` | Peer listesi |
| POST | `/api/cloud/vpn/peers` | `{ name, serverId? }` |
| GET | `/api/cloud/vpn/peers/:id/config` | Config JSON (`?download=1` → `.conf`) |
| GET | `/api/cloud/vpn/peers/:id/qr` | PNG QR |
| DELETE | `/api/cloud/vpn/peers/:id` | Revoke |

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
- Studio → Cloud → **VPN / WireGuard**
- Sunucu detay checklist: **VPN ile bağlan** (Windows RDP adımı)
