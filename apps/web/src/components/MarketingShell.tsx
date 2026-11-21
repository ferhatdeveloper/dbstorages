import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import {
  ThemeToggle,
  CurrencyToggle,
  GraphCoreLogo,
  CONSOLE_URL,
} from '@graphcore/shared'

type Props = {
  children: React.ReactNode
  /** Compact top bar only (auth forms) */
  variant?: 'full' | 'auth'
  active?:
    | 'home'
    | 'cloud'
    | 'database'
    | 'storage'
    | 'pricing'
    | 'login'
    | 'register'
}

const MarketingShell: React.FC<Props> = ({
  children,
  variant = 'full',
  active,
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const { count: cartCount } = useCart()
  const close = () => setMenuOpen(false)

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  return (
    <div className={`landing-root hz-theme${variant === 'auth' ? ' hz-auth' : ''}`}>
      <header className="landing-nav hz-nav">
        <Link
          to="/"
          className="landing-brand hz-brand gc-brand-link"
          onClick={close}
        >
          <GraphCoreLogo variant="compact" />
        </Link>

        {variant === 'full' && (
          <button
            type="button"
            className={`landing-menu-btn${menuOpen ? ' is-open' : ''}`}
            aria-label={menuOpen ? 'Menüyü kapat' : 'Menü'}
            aria-expanded={menuOpen}
            aria-controls="hz-mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        )}

        {variant === 'full' && menuOpen ? (
          <button
            type="button"
            className="hz-nav-backdrop"
            aria-label="Menüyü kapat"
            onClick={close}
          />
        ) : null}

        <nav
          id="hz-mobile-nav"
          className={`landing-nav-links${menuOpen ? ' is-open' : ''}${
            variant === 'auth' ? ' hz-auth-nav' : ''
          }`}
        >
          {variant === 'full' && (
            <>
              <Link
                to="/cloud"
                className={active === 'cloud' ? 'is-nav-active' : undefined}
                onClick={close}
              >
                Cloud
              </Link>
              <Link
                to="/database"
                className={active === 'database' ? 'is-nav-active' : undefined}
                onClick={close}
              >
                Database
              </Link>
              <Link
                to="/storage"
                className={active === 'storage' ? 'is-nav-active' : undefined}
                onClick={close}
              >
                Storage
              </Link>
              <Link
                to="/pricing"
                className={active === 'pricing' ? 'is-nav-active' : undefined}
                onClick={close}
              >
                Fiyatlar
              </Link>
              <Link to="/domains" onClick={close}>
                Domain
              </Link>
              <Link
                to="/cart"
                className="hz-nav-cart"
                onClick={close}
                aria-label={cartCount ? `Sepet, ${cartCount} ürün` : 'Sepet'}
              >
                Sepet{cartCount > 0 ? ` (${cartCount})` : ''}
              </Link>
            </>
          )}
          <div className="landing-nav-tools">
            {variant === 'full' && <CurrencyToggle />}
            <ThemeToggle />
          </div>
          {variant === 'full' ? (
            <div className="hz-nav-auth-row">
              <Link
                to="/login"
                className={
                  active === 'login'
                    ? 'is-nav-active hz-nav-login'
                    : 'hz-nav-login'
                }
                onClick={close}
              >
                Giriş
              </Link>
              <Link to="/register" className="landing-cta-sm" onClick={close}>
                Başla
              </Link>
            </div>
          ) : (
            <Link to="/" onClick={close}>
              Ana sayfa
            </Link>
          )}
        </nav>
      </header>

      {children}

      {variant === 'full' && (
        <footer className="hz-footer">
          <div className="hz-footer-cta">
            <div className="hz-footer-cta-inner">
              <div>
                <h2>Bulutu sade tutun</h2>
                <p>
                  Cloud sunucu, Database ve storage — tek panel, şeffaf fiyat.
                </p>
              </div>
              <Link to="/cart?plan=pro&interval=month" className="hz-btn-solid hz-footer-cta-btn">
                Pro’yu sepete ekle
              </Link>
            </div>
          </div>

          <div className="hz-footer-main">
            <div className="hz-footer-inner">
              <div className="hz-footer-brand">
                <Link to="/" className="hz-footer-logo gc-brand-link">
                  <GraphCoreLogo variant="wordmark" invert />
                </Link>
                <p>
                  Avrupa odaklı cloud hosting. VPS kiralama, yönetilen Database
                  ve object storage.
                </p>
                <div className="hz-footer-chips">
                  <span>EUR fiyat</span>
                  <span>GDPR</span>
                  <span>99.9% hedef</span>
                </div>
              </div>

              <nav className="hz-footer-nav" aria-label="Footer">
                <div>
                  <h4>Ürün</h4>
                  <Link to="/cloud">Cloud / VPS</Link>
                  <Link to="/database">Database</Link>
                  <Link to="/storage">Storage</Link>
                  <Link to="/pricing">Fiyatlar</Link>
                </div>
                <div>
                  <h4>Panel</h4>
                  <a href={`${CONSOLE_URL}/cloud/servers`}>Cloud sunucular</a>
                  <a href={`${CONSOLE_URL}/dashboard`}>DB Studio</a>
                  <a href={`${CONSOLE_URL}/cloud/vpn`}>VPN</a>
                </div>
                <div>
                  <h4>Hesap</h4>
                  <Link to="/login">Giriş</Link>
                  <Link to="/register">Kayıt</Link>
                  <Link to="/pricing">Paketler</Link>
                  <Link to="/domains">Domain</Link>
                  <Link to="/cart">Sepette öde</Link>
                </div>
                <div>
                  <h4>Kaynak</h4>
                  <Link to="/cloud">Sunucu aileleri</Link>
                  <Link to="/database">Database paketleri</Link>
                  <a href={`${CONSOLE_URL}/cloud/servers`}>Provision</a>
                </div>
              </nav>
            </div>
          </div>

          <div className="hz-footer-bar">
            <div className="hz-footer-bar-inner">
              <span>© {new Date().getFullYear()} GraphCore</span>
              <span className="hz-footer-bar-sep" aria-hidden>
                ·
              </span>
              <span>Cloud hosting</span>
              <span className="hz-footer-bar-sep" aria-hidden>
                ·
              </span>
              <span>Avrupa altyapı</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}

export default MarketingShell
