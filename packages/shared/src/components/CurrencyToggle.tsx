import React from 'react'
import { DISPLAY_CURRENCIES, type DisplayCurrency } from '../lib/fx'
import { useCurrency } from '../context/CurrencyContext'

type Props = {
  className?: string
  /** Show rate hint below toggle */
  showHint?: boolean
}

const CurrencyToggle: React.FC<Props> = ({ className = '', showHint = false }) => {
  const { currency, setCurrency, fxHint } = useCurrency()

  return (
    <div className={`currency-toggle-wrap ${className}`.trim()}>
      <div
        className="currency-toggle"
        role="group"
        aria-label="Para birimi"
      >
        {DISPLAY_CURRENCIES.map((c) => (
          <button
            key={c.code}
            type="button"
            className={`currency-toggle-btn${currency === c.code ? ' is-active' : ''}`}
            onClick={() => setCurrency(c.code as DisplayCurrency)}
            aria-pressed={currency === c.code}
            title={c.label}
          >
            {c.symbol}
          </button>
        ))}
      </div>
      {showHint && fxHint ? (
        <p className="currency-fx-hint">{fxHint}</p>
      ) : null}
    </div>
  )
}

export default CurrencyToggle
