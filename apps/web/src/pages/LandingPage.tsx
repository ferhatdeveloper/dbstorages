import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'
import { apiService, useCurrency } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'
import { useCart } from '../context/CartContext'
import { cartPath } from '../lib/cartPlans'
import { localDomainSuggest } from '../lib/domainSuggestLocal'

const BENEFITS = [
  {
    title: 'Fiyatlandırma',
    sub: 'Şeffaf sunucu ve Database paketleri',
    href: '/pricing',
  },
  {
    title: 'Domain',
    sub: 'Alan adı sorgula ve sepete ekle',
    href: '/domains',
  },
  {
    title: 'Avrupa altyapı',
    sub: 'GDPR uyumlu bölgeler',
    href: '/cloud',
  },
  {
    title: 'Kolay kullanım',
    sub: 'Panelden saniyeler içinde açın',
    href: '/register',
  },
]

type DomainRow = {
  name: string
  tld: string
  available: boolean
  priceUsdCents: number
  priceTryCents: number
}

const LandingPage: React.FC = () => {
  const { addItem } = useCart()
  const { formatCents, currency } = useCurrency()
  const navigate = useNavigate()
  const [domainQ, setDomainQ] = useState('')
  const [domainRows, setDomainRows] = useState<DomainRow[]>([])
  const [domainBusy, setDomainBusy] = useState(false)
  const [domainError, setDomainError] = useState('')
  const [domainToast, setDomainToast] = useState('')

  const priceFor = (row: DomainRow) =>
    String(currency || '').toUpperCase() === 'TRY'
      ? row.priceTryCents
      : row.priceUsdCents

  const searchDomain = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!domainQ.trim()) return
    setDomainBusy(true)
    setDomainError('')
    setDomainToast('')
    try {
      const res = await apiService.domainSuggest(domainQ.trim())
      const list = res.data?.results || []
      if (list.length) setDomainRows(list)
      else if (res.data?.error) {
        setDomainError(res.data.error)
        setDomainRows([])
      } else setDomainRows(localDomainSuggest(domainQ.trim()) as DomainRow[])
    } catch {
      const fallback = localDomainSuggest(domainQ.trim()) as DomainRow[]
      setDomainRows(fallback)
      if (!fallback.length) setDomainError('Sorgulanamadı')
    } finally {
      setDomainBusy(false)
    }
  }

  const addDomain = (row: DomainRow) => {
    if (!row.available) return
    const fqdn = String(row.name || '').trim().toLowerCase()
    if (!fqdn) return
    const tryMode = String(currency || '').toUpperCase() === 'TRY'
    addItem({
      type: 'domain',
      id: fqdn,
      name: fqdn,
      priceCents: priceFor(row),
      currency: tryMode ? 'try' : 'usd',
      years: 1,
      meta: { tld: row.tld },
    })
    setDomainToast(`${fqdn} sepete eklendi`)
    navigate('/cart')
  }

  return (
    <MarketingShell active="home">
      <main>
        <section className="hz-hero">
          <div className="hz-hero-inner">
            <div className="hz-hero-copy">
              <span className="hz-pill">Cloud</span>
              <h1>Uygun fiyatlı cloud hosting</h1>
              <p>
                Zorlu projelerinizin hak ettiği sade ve güçlü bulut. Kolay,
                esnek ve güvenli — sunucu ile yönetilen Database aynı panelde.
              </p>
              <Link to={cartPath({ plan: 'pro', interval: 'month' })} className="hz-btn-ghost">
                Paketi sepete ekle
                <ArrowRight size={18} />
              </Link>
            </div>
            <div className="hz-hero-art" aria-hidden>
              <div className="hz-cloud hz-cloud-a" />
              <div className="hz-cloud hz-cloud-b" />
              <div className="hz-rack">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className="hz-hero-cut" aria-hidden />
        </section>

        <section className="hz-domain-bridge" aria-label="Domain sorgula">
          <div className="hz-domain-card">
            <div className="hz-domain-card-head">
              <h2>Alan adınızı bulun</h2>
              <Link to="/domains" className="hz-domain-more">
                Tüm uzantılar
                <ChevronRight size={16} />
              </Link>
            </div>
            <form className="hz-domain-form" onSubmit={searchDomain}>
              <input
                type="search"
                value={domainQ}
                onChange={(e) => setDomainQ(e.target.value)}
                placeholder="ornek.com"
                aria-label="Domain sorgusu"
              />
              <button
                type="submit"
                className="hz-domain-submit"
                disabled={domainBusy || !domainQ.trim()}
              >
                {domainBusy ? '…' : 'Sorgula'}
              </button>
            </form>
            {domainError && <p className="hz-domain-msg is-err">{domainError}</p>}
            {domainToast && (
              <p className="hz-domain-msg is-ok">
                {domainToast} — <Link to="/cart">Sepete git</Link>
              </p>
            )}
            {domainRows.length > 0 && (
              <ul className="hz-domain-list">
                {domainRows.slice(0, 5).map((row) => (
                  <li key={row.name}>
                    <div className="hz-domain-list-name">
                      <strong>{row.name}</strong>
                      <span className={row.available ? 'is-ok' : 'is-taken'}>
                        {row.available ? 'Müsait' : 'Kayıtlı'}
                      </span>
                    </div>
                    <div className="hz-domain-list-actions">
                      <span className="hz-domain-price">
                        {formatCents(
                          priceFor(row),
                          String(currency).toUpperCase() === 'TRY' ? 'try' : 'usd',
                          {
                            maximumFractionDigits: 0,
                            minimumFractionDigits: 0,
                          }
                        )}
                        <small>/yıl</small>
                      </span>
                      <button
                        type="button"
                        className="hz-domain-add"
                        disabled={!row.available}
                        onClick={() => addDomain(row)}
                      >
                        Sepete ekle
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="hz-benefits" aria-label="Öne çıkanlar">
          {BENEFITS.map((b) => (
            <Link key={b.title} to={b.href} className="hz-benefit">
              <Check size={18} />
              <div>
                <strong>{b.title}</strong>
                <span>{b.sub}</span>
              </div>
              <ChevronRight size={16} />
            </Link>
          ))}
        </section>

        <section className="hz-dual-band">
          <div className="hz-dual-inner">
            <article>
              <h2>Cloud sunucu</h2>
              <p>
                Region, image, volume, firewall ve SSH key ile VPS provision.
                Shared ve dedicated benzeri aileler; net spec, şeffaf fiyat.
              </p>
              <Link to="/cloud" className="hz-link-arrow">
                Sunucu planları
                <ChevronRight size={16} />
              </Link>
            </article>
            <article>
              <h2>Yönetilen Database</h2>
              <p>
                Gerçek Database instance: Table Editor, SQL Studio ve REST.
                Ödeme sonrası connection string anında.
              </p>
              <Link to="/database" className="hz-link-arrow">
                Database paketleri
                <ChevronRight size={16} />
              </Link>
            </article>
          </div>
        </section>

        <section id="ops" className="hz-ops">
          <div className="hz-ops-grid">
            <div>
              <h3>Konumlar</h3>
              <p>
                Avrupa bölgelerinde provision. Düşük gecikme, GDPR odaklı
                operasyon.
              </p>
            </div>
            <div>
              <h3>99.9% uptime hedefi</h3>
              <p>
                Üretim iş yükleri için öngörülebilir altyapı ve 7/24 destek
                kanalları.
              </p>
            </div>
            <div>
              <h3>Yedekleme &amp; VPN</h3>
              <p>
                Opsiyonel yedekleme ve WireGuard VPN eklentileri — planlardan
                bağımsız.
              </p>
            </div>
          </div>
        </section>

        <section className="hz-cta-band">
          <h2>Kendi cloud sunucunuzu birkaç adımda açın</h2>
          <p>
            Kaydolun, plan seçin, panelden yönetin. IT karmaşık olmak zorunda
            değil.
          </p>
          <div className="hz-cta-band-actions">
            <Link to={cartPath({ plan: 'pro', interval: 'month' })} className="hz-btn-solid">
              Database sepete
              <ArrowRight size={18} />
            </Link>
            <Link to="/cloud" className="hz-btn-ghost" style={{ marginLeft: '0.75rem' }}>
              VPS — panelden
            </Link>
          </div>
        </section>
      </main>
    </MarketingShell>
  )
}

export default LandingPage
