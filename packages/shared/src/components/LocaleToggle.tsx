import React from 'react'
import { LOCALES, LOCALE_META } from '../i18n/types'
import { useLocale } from '../context/LocaleContext'

type Props = {
  className?: string
  /** Compact select (default) or segmented buttons */
  variant?: 'select' | 'segment'
}

const LocaleToggle: React.FC<Props> = ({
  className = '',
  variant = 'select',
}) => {
  const { locale, setLocale, t } = useLocale()

  if (variant === 'segment') {
    return (
      <div
        className={`locale-toggle locale-toggle-segment ${className}`.trim()}
        role="group"
        aria-label={t('common.language')}
      >
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={`locale-toggle-btn${locale === code ? ' is-active' : ''}`}
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
            title={LOCALE_META[code].native}
          >
            {LOCALE_META[code].short}
          </button>
        ))}
      </div>
    )
  }

  return (
    <label
      className={`locale-toggle locale-toggle-select ${className}`.trim()}
      title={t('common.language')}
    >
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        aria-label={t('common.language')}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_META[code].short}
          </option>
        ))}
      </select>
    </label>
  )
}

export default LocaleToggle
