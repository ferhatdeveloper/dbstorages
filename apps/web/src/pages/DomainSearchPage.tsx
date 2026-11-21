import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { apiService, useCurrency } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'
import { useCart } from '../context/CartContext'
import {
  localDomainCatalog,
  localDomainSuggest,
} from '../lib/domainSuggestLocal'

type SuggestRow = {
  name: string
  tld: string
  available: boolean
  priceUsdCents: number
  priceTryCents: number
  years: number
}

type TldPrice = {
  tld: string
  priceUsdCents: number
  priceTryCents: number
}

const DomainSearchPage: React.FC = () => {
  const { addItem, count } = useCart()
  const { formatCents, currency } = useCurrency()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [rows, setRows] = useState<SuggestRow[]>([])
  const [catalog, setCatalog] = useState<TldPrice[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [searched, setSearched] = useState(false)

  const tryMode = String(currency || '').toUpperCase() === 'TRY'

  useEffect(() => {
    apiService
      .domainPricing()
      .then((res) => setCatalog(res.data || []))
      .catch(() => setCatalog(localDomainCatalog() as TldPrice[]))
  }, [])

  useEffect(() => {
    const initial = params.get('q')
    if (initial?.trim()) {
      setQ(initial)
      void runSearch(initial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const priceFor = (row: { priceUsdCents: number; priceTryCents: number }) =>
    tryMode ? row.priceTryCents : row.priceUsdCents

  const runSearch = async (query: string) => {
    setError('')
    setToast('')
    setLoading(true)
    setSearched(true)
    try {
      const res = await apiService.domainSuggest(query)
      const list = res.data?.results || []
      if (list.length) {
        setRows(list)
      } else if (res.data?.error) {
        setError(res.data.error)
        setRows([])
      } else {
        setRows(localDomainSuggest(query) as SuggestRow[])
      }
    } catch (err: any) {
      const fallback = localDomainSuggest(query) as SuggestRow[]
      setRows(fallback)
      setError(
        fallback.length
          ? 'Canlı sorgu yok — yerel katalog gösteriliyor'
          : err.message || 'Sorgulanamadı'
      )
    } finally {
      setLoading(false)
    }
  }

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!q.trim()) return
    await runSearch(q.trim())
  }

  const pickTld = (tld: string) => {
    const label = q.includes('.') ? q.split('.')[0] : q.trim() || 'ornek'
    const next = `${label.replace(/[^a-z0-9-]/gi, '')}.${tld}`
    setQ(next)
    void runSearch(next)
  }

  const addDomain = (row: SuggestRow) => {
    if (!row.available) return
    const fqdn = String(row.name || '').trim().toLowerCase()
    if (!fqdn) return
    addItem({
      type: 'domain',
      id: fqdn,
      name: fqdn,
      priceCents: priceFor(row),
      currency: tryMode ? 'try' : 'usd',
      years: 1,
      meta: { tld: row.tld },
    })
    setToast(`${fqdn} sepete eklendi`)
    navigate('/cart')
  }

  const available = rows.filter((r) => r.available)
  const taken = rows.filter((r) => !r.available)

  return (
    <MarketingShell active="pricing">
      <div className="hz-page-band hz-page-band-sm">
        <div className="hz-page-band-inner">
          <span className="hz-pill">Domain</span>
          <h1>Alan adı kaydı</h1>
          <p>Sorgula, sepete ekle, ödemeyi sepetten tamamla.</p>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </div>

      <main className="hz-domains-page">
        <div className="hz-domain-bridge hz-domains-search">
          <div className="hz-domain-card">
            <div className="hz-domain-card-head">
              <h2>Alan adını ara</h2>
              {count > 0 && (
                <Link to="/cart" className="hz-domain-more">
                  Sepet ({count})
                  <ChevronRight size={16} />
                </Link>
              )}
            </div>
            <form className="hz-domain-form" onSubmit={search}>
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ornek veya ornek.com"
                aria-label="Domain sorgusu"
                autoFocus
              />
              <button
                type="submit"
                className="hz-domain-submit"
                disabled={loading || !q.trim()}
              >
                {loading ? '…' : 'Sorgula'}
              </button>
            </form>
            {error && <p className="hz-domain-msg is-err">{error}</p>}
            {toast && (
              <p className="hz-domain-msg is-ok">
                {toast} — <Link to="/cart">Sepete git</Link>
              </p>
            )}
          </div>
        </div>

        {catalog.length > 0 && (
          <section className="hz-domains-tlds" aria-label="Uzantı fiyatları">
            <h3>Popüler uzantılar</h3>
            <div className="hz-domains-tld-grid">
              {catalog.map((t) => (
                <button
                  key={t.tld}
                  type="button"
                  className="hz-domains-tld"
                  onClick={() => pickTld(t.tld)}
                >
                  <strong>.{t.tld}</strong>
                  <span>
                    {formatCents(priceFor(t), tryMode ? 'try' : 'usd', {
                      maximumFractionDigits: 0,
                      minimumFractionDigits: 0,
                    })}
                    /yıl
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {searched && !loading && (
          <section className="hz-domains-results" aria-live="polite">
            {rows.length === 0 ? (
              <p className="hz-domains-empty">Sonuç yok. Başka bir ad deneyin.</p>
            ) : (
              <>
                {available.length > 0 && (
                  <div className="hz-domains-block">
                    <h3>Müsait ({available.length})</h3>
                    <ul className="hz-domain-list hz-domain-list-page">
                      {available.map((row) => (
                        <li key={row.name}>
                          <div className="hz-domain-list-name">
                            <strong>{row.name}</strong>
                            <span className="is-ok">Müsait</span>
                          </div>
                          <div className="hz-domain-list-actions">
                            <span className="hz-domain-price">
                              {formatCents(priceFor(row), tryMode ? 'try' : 'usd', {
                                maximumFractionDigits: 0,
                                minimumFractionDigits: 0,
                              })}
                              <small>/yıl</small>
                            </span>
                            <button
                              type="button"
                              className="hz-domain-add is-primary"
                              onClick={() => addDomain(row)}
                            >
                              Sepete ekle
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {taken.length > 0 && (
                  <div className="hz-domains-block is-muted">
                    <h3>Kayıtlı</h3>
                    <ul className="hz-domain-list hz-domain-list-page">
                      {taken.map((row) => (
                        <li key={row.name}>
                          <div className="hz-domain-list-name">
                            <strong>{row.name}</strong>
                            <span className="is-taken">Alınmış</span>
                          </div>
                          <div className="hz-domain-list-actions">
                            <span className="hz-domain-price is-dim">—</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <p className="hz-domains-foot">
          <Link to="/pricing">Paketler</Link>
          <span>·</span>
          <Link to="/cart">Sepet</Link>
          <span>·</span>
          <Link to="/">Anasayfa</Link>
        </p>
      </main>
    </MarketingShell>
  )
}

export default DomainSearchPage
