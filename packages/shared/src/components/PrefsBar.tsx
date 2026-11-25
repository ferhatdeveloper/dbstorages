import React from 'react'
import CurrencyToggle from './CurrencyToggle'
import ThemeToggle from './ThemeToggle'
import LocaleToggle from './LocaleToggle'

type Props = {
  className?: string
  /** Show currency switcher (default true) */
  showCurrency?: boolean
  /** Locale control style */
  localeVariant?: 'select' | 'segment'
  themeVariant?: 'icon' | 'pill'
}

/**
 * Compact prefs cluster: language · currency · theme
 */
const PrefsBar: React.FC<Props> = ({
  className = '',
  showCurrency = true,
  localeVariant = 'select',
  themeVariant = 'icon',
}) => {
  return (
    <div className={`prefs-bar ${className}`.trim()} role="toolbar" aria-label="Preferences">
      <LocaleToggle variant={localeVariant} />
      {showCurrency ? (
        <>
          <span className="prefs-bar-sep" aria-hidden />
          <CurrencyToggle />
        </>
      ) : null}
      <span className="prefs-bar-sep" aria-hidden />
      <ThemeToggle variant={themeVariant} />
    </div>
  )
}

export default PrefsBar
