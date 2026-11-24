import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight, ShoppingBag, Trash2 } from 'lucide-react'
import { apiService, useAuth, useCurrency, CONSOLE_URL } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'
import { useCart, type CartItem } from '../context/CartContext'

type PayProvider = { id: string; configured: boolean }

const PAY_LABELS: Record<string, string> = {
  polar: 'Kart (Polar)',
  lemonsqueezy: 'Kart (Lemon Squeezy)',
  stripe: 'Kart (Stripe)',
  iyzico: 'iyzico',
  paytr: 'PayTR',
  crypto: 'Kripto (USDT)',
}

const TYPE_LABEL: Record<CartItem['type'], string> = {
  plan: 'Database',
  addon: 'Add-on',
  domain: 'Domain',
  vps: 'VPS',
}

function lineCents(item: CartItem, billingInterval: 'month' | 'year') {
  if (
    (item.type === 'plan' || item.type === 'addon') &&
    billingInterval === 'year' &&
    item.meta?.priceYearCents != null
  ) {
    return Number(item.meta.priceYearCents)
  }
  return item.priceCents
}

const CONSOLE_CLOUD_SERVERS = `${CONSOLE_URL}/cloud/servers`

function lineMeta(item: CartItem, billingInterval: 'month' | 'year') {
  if (item.type === 'domain')
    return `${item.years || 1} yıl · kayıt beklemede (manuel)`
  if (item.type === 'vps') return 'İlk ay ücreti · VPS Console’dan açılır'
  if (item.type === 'plan') {
    return billingInterval === 'year' ? 'Yıllık abonelik' : 'Aylık abonelik'
  }
  return billingInterval === 'year' ? 'Yıllık' : 'Aylık'
}

const CartPage: React.FC = () => {
  const {
    items,
    removeItem,
    clear,
    billingInterval,
    setInterval,
    planItem,
    addonIds,
    domains,
    vpsItems,
    totalCents,
    addDatabasePlan,
  } = useCart()
  const { isAuthenticated } = useAuth()
  const { formatCents, fxHint } = useCurrency()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const canceled = params.get('canceled')

  const [payProviders, setPayProviders] = useState<PayProvider[]>([
    { id: 'polar', configured: false },
    { id: 'crypto', configured: false },
  ])
  const [payProvider, setPayProvider] = useState('polar')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    apiService
      .getPackages()
      .then((res) => {
        if (res.providers?.length) {
          setPayProviders(res.providers)
          const preferred =
            res.providers.find((p: PayProvider) => p.id === 'polar') ||
            res.providers.find((p: PayProvider) => p.configured) ||
            res.providers[0]
          setPayProvider(preferred.id)
        }
      })
      .catch(() => undefined)
  }, [])

  // Deep-link: /cart?plan=pro&interval=month&backup=1
  useEffect(() => {
    if (hydrated) return
    const plan = params.get('plan')
    if (!plan) {
      setHydrated(true)
      return
    }
    const interval = params.get('interval') === 'year' ? 'year' : 'month'
    const backup = params.get('backup') === '1'
    addDatabasePlan({ planId: plan, interval, backup })
    const next = new URLSearchParams(params)
    next.delete('plan')
    next.delete('interval')
    next.delete('backup')
    setParams(next, { replace: true })
    setHydrated(true)
  }, [params, addDatabasePlan, hydrated, setParams])

  const currency = planItem?.currency || items[0]?.currency || 'usd'

  const grouped = useMemo(() => {
    const plans = items.filter((i) => i.type === 'plan')
    const backups = items.filter(
      (i) => i.type === 'addon' && String(i.id).startsWith('backup-')
    )
    const addons = items.filter(
      (i) =>
        i.type === 'addon' &&
        !String(i.id).startsWith('backup-') &&
        i.id !== 'vpn' &&
        i.id !== 'vps'
    )
    const blocked = items.filter(
      (i) =>
        i.type === 'vps' ||
        (i.type === 'addon' && (i.id === 'vpn' || i.id === 'vps'))
    )
    const doms = items.filter((i) => i.type === 'domain')
    const vps = items.filter((i) => i.type === 'vps')
    return { plans, backups, addons, doms, vps, blocked }
  }, [items])

  const polarBlockedInfra = payProvider === 'polar' && grouped.blocked.length > 0

  const checkout = async () => {
    setError('')
    if (!items.length) {
      setError('Sepet boş')
      return
    }
    if (payProvider === 'polar' && grouped.blocked.length > 0) {
      setError(
        'Polar yalnızca database, backup ve domain içindir. VPS/VPN kalemlerini sepetten çıkarın; Console → Cloud’dan açın.'
      )
      return
    }
    if (!isAuthenticated) {
      navigate('/register', { state: { from: '/cart' } })
      return
    }
    setLoading(true)
    try {
      const safeAddons = addonIds.filter((id) => id !== 'vpn' && id !== 'vps')
      const body: {
        planId?: string
        provider: string
        interval: 'month' | 'year'
        addons: string[]
        domains: { name: string; years: number }[]
        vps: { id: string; name: string; priceCents: number }[]
      } = {
        provider: payProvider,
        interval: billingInterval,
        addons: safeAddons,
        domains,
        vps:
          payProvider === 'polar'
            ? []
            : vpsItems.map((v) => ({
                id: v.id,
                name: v.name,
                priceCents: v.priceCents,
              })),
      }
      if (planItem) body.planId = planItem.id
      else body.planId = 'domains-only'

      const res = await apiService.checkout(body)
      const data = res.data
      // Real redirect (Stripe/iyzico/PayTR/NOWPayments) or deferred crypto mock page
      if (
        data?.checkoutUrl &&
        data.status === 'pending' &&
        (!data.mock || data.deferFulfillment)
      ) {
        clear()
        if (/^https?:\/\//i.test(data.checkoutUrl)) {
          window.location.href = data.checkoutUrl
        } else {
          navigate(data.checkoutUrl)
        }
        return
      }
      clear()
      if (data?.redirectUrl) {
        navigate(
          data.redirectUrl.replace(/^https?:\/\/[^/]+/, '') || '/billing/success'
        )
        return
      }
      if (data?.checkoutUrl) {
        const url = new URL(data.checkoutUrl, window.location.origin)
        navigate(url.pathname + url.search)
        return
      }
      navigate(
        `/billing/success?plan=${body.planId || 'domains-only'}&paymentId=${data?.paymentId || ''}`
      )
    } catch (e: any) {
      setError(e.message || 'Ödeme başlatılamadı')
    } finally {
      setLoading(false)
    }
  }

  const renderGroup = (
    title: string,
    list: CartItem[],
    honesty?: { className: string; body: React.ReactNode }
  ) => {
    if (!list.length) return null
    return (
      <div className="hz-cart-group">
        <h3>{title}</h3>
        {honesty ? (
          <div
            className={`hz-cart-honesty ${honesty.className}`}
            role="note"
          >
            {honesty.body}
          </div>
        ) : null}
        <ul className="hz-cart-lines">
          {list.map((item) => {
            const cents = lineCents(item, billingInterval)
            return (
              <li key={`${item.type}:${item.id}`} className="hz-cart-line">
                <div className="hz-cart-line-main">
                  <span className={`hz-cart-badge is-${item.type}`}>
                    {TYPE_LABEL[item.type]}
                  </span>
                  <div>
                    <strong>{item.name || item.id}</strong>
                    <span className="hz-cart-line-meta">
                      {lineMeta(item, billingInterval)}
                    </span>
                  </div>
                </div>
                <div className="hz-cart-line-side">
                  <span className="hz-cart-price">
                    {formatCents(cents, item.currency || currency, {
                      maximumFractionDigits: 0,
                      minimumFractionDigits: 0,
                    })}
                  </span>
                  <button
                    type="button"
                    className="hz-cart-remove"
                    aria-label={`${item.name || item.id} kaldır`}
                    onClick={() => removeItem(item.type, item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <MarketingShell>
      <div className="hz-page-band hz-page-band-sm">
        <div className="hz-page-band-inner">
          <span className="hz-pill">Sepet</span>
          <h1>Siparişi tamamla</h1>
          <p>
            {items.length
              ? `${items.length} kalem · ödeme burada tamamlanır`
              : 'Paket veya domain ekleyerek başlayın'}
          </p>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </div>

      <main className="hz-cart-page">
        {canceled && (
          <div className="hz-cart-alert">Ödeme iptal edildi — sepetiniz duruyor.</div>
        )}
        {error && <div className="hz-cart-alert is-err">{error}</div>}

        {!items.length ? (
          <div className="hz-cart-empty">
            <div className="hz-cart-empty-icon" aria-hidden>
              <ShoppingBag size={28} />
            </div>
            <h2>Sepetiniz boş</h2>
            <p>
              Database, backup veya alan adı ekleyin. VPS / VPN Console üzerinden
              açılır (kart sepeti dışı).
            </p>
            <div className="hz-cart-empty-actions">
              <Link to="/database" className="hz-btn-solid">
                Paketlere git
                <ChevronRight size={16} />
              </Link>
              <Link to="/domains" className="hz-cart-ghost">
                Domain ara
              </Link>
            </div>
          </div>
        ) : (
          <div className="hz-cart-layout">
            <section className="hz-cart-items" aria-label="Sepet kalemleri">
              {renderGroup('Database planı', grouped.plans)}
              {renderGroup('Veeam Backup · QNAP', grouped.backups, {
                className: 'is-backup',
                body: (
                  <>
                    S3 yedek kotası ödemeden sonra{' '}
                    <strong>Studio → Storage</strong> üzerinden kullanılır
                    (endpoint / erişim anahtarı). Veeam Backup veya QNAP HBS3’e
                    bağlayın; bucket paneldedir.
                  </>
                ),
              })}
              {renderGroup('Eklentiler', grouped.addons)}
              {renderGroup('Alan adları', grouped.doms, {
                className: 'is-domain',
                body: (
                  <>
                    Kayıt kurumu bağlantısı tamamlanana kadar domain siparişleri
                    ödeme sonrası <strong>beklemede ve manuel</strong> işlenir.
                    Hazır olduğunda bilgilendirilirsiniz.
                  </>
                ),
              })}
              {grouped.blocked.length > 0 && (
                <div
                  className="hz-cart-honesty is-vps"
                  role="alert"
                  style={{ marginBottom: '1rem' }}
                >
                  <p>
                    Sepette VPS/VPN kalemi var. Kart (Polar) ödemesi yalnızca
                    database, backup ve domain içindir. Bu kalemleri çıkarın;
                    altyapıyı{' '}
                    <a
                      href={CONSOLE_CLOUD_SERVERS}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Console → Cloud
                    </a>{' '}
                    üzerinden açın.
                  </p>
                  <div style={{ marginTop: '0.5rem' }}>
                    {grouped.blocked.map((b) => (
                      <button
                        key={`${b.type}-${b.id}`}
                        type="button"
                        className="hz-cart-clear"
                        onClick={() => removeItem(b.type, b.id)}
                      >
                        {b.name} — kaldır
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="hz-cart-continue">
                <Link to="/database">+ Paket ekle</Link>
                <Link to="/storage">+ Backup ekle</Link>
                <Link to="/domains">+ Domain ekle</Link>
                <a href={CONSOLE_CLOUD_SERVERS}>Cloud (Console)</a>
                <button type="button" className="hz-cart-clear" onClick={clear}>
                  Sepeti temizle
                </button>
              </div>
            </section>

            <aside className="hz-cart-summary" aria-label="Özet">
              <div className="hz-cart-summary-card">
                <h2>Özet</h2>

                {planItem && planItem.priceCents > 0 && (
                  <div
                    className="hz-cart-interval"
                    role="group"
                    aria-label="Faturalama dönemi"
                  >
                    <button
                      type="button"
                      className={billingInterval === 'month' ? 'is-active' : undefined}
                      onClick={() => setInterval('month')}
                    >
                      Aylık
                    </button>
                    <button
                      type="button"
                      className={billingInterval === 'year' ? 'is-active' : undefined}
                      onClick={() => setInterval('year')}
                    >
                      Yıllık
                    </button>
                  </div>
                )}

                <dl className="hz-cart-totals">
                  <div>
                    <dt>Kalem</dt>
                    <dd>{items.length}</dd>
                  </div>
                  <div className="is-total">
                    <dt>Toplam</dt>
                    <dd>
                      {formatCents(totalCents, currency, {
                        maximumFractionDigits: 0,
                        minimumFractionDigits: 0,
                      })}
                    </dd>
                  </div>
                </dl>
                {planItem && planItem.priceCents > 0 && (
                  <p className="hz-cart-note">
                    Database planı{' '}
                    {billingInterval === 'year' ? 'yıllık' : 'aylık'} faturalanır.
                  </p>
                )}
                {(grouped.doms.length > 0 || grouped.backups.length > 0) && (
                  <div
                    className="hz-cart-honesty-stack"
                    role="region"
                    aria-label="Ödeme sonrası süreç"
                  >
                    {grouped.backups.length > 0 && (
                      <div
                        className="hz-cart-honesty is-backup is-compact"
                        role="note"
                      >
                        Backup: Studio → Storage → Veeam / QNAP HBS3.
                      </div>
                    )}
                    {grouped.doms.length > 0 && (
                      <div
                        className="hz-cart-honesty is-domain is-compact"
                        role="note"
                      >
                        Kayıt kurumu bağlantısı tamamlanana kadar domain
                        siparişleri ödeme sonrası beklemede ve manuel işlenir.
                      </div>
                    )}
                  </div>
                )}
                <p className="hz-cart-note">
                  Kart (Polar): database, backup, domain. VPS/VPN → Console Cloud.
                </p>

                <div
                  className="hz-cart-pay"
                  role="radiogroup"
                  aria-label="Ödeme yöntemi"
                >
                  <p className="hz-cart-pay-label">Ödeme yöntemi</p>
                  <div className="hz-cart-pay-grid">
                    {payProviders.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="radio"
                        aria-checked={payProvider === p.id}
                        className={`hz-cart-pay-card${payProvider === p.id ? ' is-active' : ''}`}
                        onClick={() => setPayProvider(p.id)}
                      >
                        <strong>{PAY_LABELS[p.id] || p.id}</strong>
                        <span>{p.configured ? 'Hazır' : 'Mock'}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="hz-cart-checkout"
                  disabled={loading || polarBlockedInfra}
                  onClick={checkout}
                >
                  {loading
                    ? 'İşleniyor…'
                    : polarBlockedInfra
                      ? 'Önce VPS/VPN kaldırın'
                      : isAuthenticated
                        ? 'Ödemeyi tamamla'
                        : 'Giriş yapıp öde'}
                </button>
                {!isAuthenticated && (
                  <p className="hz-cart-note">
                    Ödeme için giriş gerekir.{' '}
                    <Link to="/login" state={{ from: '/cart' }}>
                      Giriş
                    </Link>
                  </p>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>
    </MarketingShell>
  )
}

export default CartPage
