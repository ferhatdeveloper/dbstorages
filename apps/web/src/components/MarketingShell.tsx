import React, { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useCart } from '../context/CartContext'
import {
  PrefsBar,
  GraphCoreLogo,
  CONSOLE_URL,
  useLocale,
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
  const { t } = useLocale()
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
            aria-label={menuOpen ? t('common.closeMenu') : t('common.openMenu')}
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
            aria-label={t('common.closeMenu')}
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
                {t('web.nav.cloud')}
              </Link>
              <Link
                to="/database"
                className={active === 'database' ? 'is-nav-active' : undefined}
                onClick={close}
              >
                {t('web.nav.database')}
              </Link>
              <Link
                to="/storage"
                className={active === 'storage' ? 'is-nav-active' : undefined}
                onClick={close}
              >
                {t('web.nav.storage')}
              </Link>
              <Link to="/domains" onClick={close}>
                {t('web.nav.domain')}
              </Link>
              <Link
                to="/cart"
                className="hz-nav-cart"
                onClick={close}
                aria-label={
                  cartCount
                    ? `${t('common.cart')}, ${cartCount}`
                    : t('common.cart')
                }
              >
                {t('common.cart')}
                {cartCount > 0 ? ` (${cartCount})` : ''}
              </Link>
            </>
          )}
          <div className="landing-nav-tools">
            <PrefsBar showCurrency={variant === 'full'} />
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
                {t('common.login')}
              </Link>
              <Link to="/register" className="landing-cta-sm" onClick={close}>
                {t('common.start')}
              </Link>
            </div>
          ) : (
            <Link to="/" onClick={close}>
              {t('common.home')}
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
                <h2>{t('web.footer.keepSimple')}</h2>
                <p>{t('web.footer.keepSimpleBody')}</p>
              </div>
              <Link
                to="/cart?plan=starter&interval=month"
                className="hz-btn-solid hz-footer-cta-btn"
              >
                {t('web.footer.addStarter')}
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
                  <span>USD fiyat</span>
                  <span>GDPR</span>
                  <span>99.9% hedef</span>
                </div>
              </div>

              <nav className="hz-footer-nav" aria-label="Footer">
                <div>
                  <h4>{t('web.footer.product')}</h4>
                  <Link to="/cloud">{t('web.nav.cloud')}</Link>
                  <Link to="/database">{t('web.nav.database')}</Link>
                  <Link to="/storage">{t('web.nav.storage')}</Link>
                  <Link to="/domains">{t('web.nav.domain')}</Link>
                </div>
                <div>
                  <h4>{t('web.footer.panel')}</h4>
                  <a href={`${CONSOLE_URL}/cloud/servers`}>{t('console.cloudInfra')}</a>
                  <a href={`${CONSOLE_URL}/dashboard`}>{t('console.dbStudio')}</a>
                  <a href={`${CONSOLE_URL}/cloud/vpn`}>VPN</a>
                </div>
                <div>
                  <h4>{t('web.footer.account')}</h4>
                  <Link to="/login">{t('common.login')}</Link>
                  <Link to="/register">{t('common.register')}</Link>
                  <Link to="/database">{t('web.nav.database')}</Link>
                  <Link to="/domains">{t('web.nav.domain')}</Link>
                  <Link to="/cart">{t('common.cart')}</Link>
                </div>
                <div>
                  <h4>{t('web.footer.resources')}</h4>
                  <Link to="/cloud">{t('web.nav.cloud')}</Link>
                  <Link to="/database">{t('web.nav.database')}</Link>
                  <a href={`${CONSOLE_URL}/cloud/servers`}>Provision</a>
                </div>
              </nav>
            </div>
          </div>

          <div className="hz-footer-bar">
            <div className="hz-footer-bar-inner">
              <span>© {new Date().getFullYear()} dbstorages</span>
              <span className="hz-footer-bar-sep" aria-hidden>
                ·
              </span>
              <span>Cloud hosting</span>
              <span className="hz-footer-bar-sep" aria-hidden>
                ·
              </span>
              <span>EU</span>
            </div>
          </div>
        </footer>
      )}
    </div>
  )
}

export default MarketingShell
