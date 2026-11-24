# Legacy — kullanmayın

> **Uyarı:** Bu `src/` dizini monorepo öncesi tek parça frontend kalıntısıdır. Bakım dışıdır; build/deploy pipeline’a dahil değildir.

Aktif geliştirme yalnızca şu workspace’lerde yapılır:

| Dizin | Rol |
|-------|-----|
| `apps/web` | Marketing, pricing, auth girişi |
| `apps/console` | Studio + Cloud console |
| `packages/shared` | Ortak tipler ve yardımcılar |

Yeni özellik, bugfix veya UI değişikliği **buraya yazılmamalıdır**. Taşıma ihtiyacı varsa ilgili `apps/*` paketine taşıyın ve bu klasörü silmeyi değerlendirin.