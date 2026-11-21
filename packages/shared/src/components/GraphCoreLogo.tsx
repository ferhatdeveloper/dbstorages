import React from 'react'

type Props = {
  /** mark | wordmark (mark + text) | compact (small mark + text) */
  variant?: 'mark' | 'wordmark' | 'compact'
  /** Invert for dark/blue footer backgrounds */
  invert?: boolean
  className?: string
  title?: string
}

/** GraphCore mark: G monogram as network graph — blue + red accent */
export function GraphCoreMark({
  className,
  invert = false,
  title = 'GraphCore',
}: {
  className?: string
  invert?: boolean
  title?: string
}) {
  const accent = '#D50C2D'
  const soft = invert ? '#ffffff' : '#0A4EA3'

  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect
        width="40"
        height="40"
        rx="8"
        fill={invert ? 'rgba(255,255,255,0.12)' : '#0A4EA3'}
      />
      <path
        d="M27.5 14.2c-1.35-2.35-3.95-3.9-6.9-3.9-4.45 0-8.05 3.6-8.05 8.05s3.6 8.05 8.05 8.05c2.85 0 5.35-1.5 6.75-3.7"
        stroke="#fff"
        strokeWidth="2.75"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M20.5 20.2H27.6"
        stroke="#fff"
        strokeWidth="2.75"
        strokeLinecap="round"
      />
      <circle cx="20.6" cy="10.3" r="2" fill={accent} />
      <circle cx="27.5" cy="14.2" r="1.65" fill={accent} />
      <circle cx="27.8" cy="20.2" r="1.9" fill={accent} />
      <circle
        cx="26.4"
        cy="25.6"
        r="1.45"
        fill={soft}
        opacity={invert ? 0.9 : 0.35}
      />
      <circle
        cx="13.6"
        cy="18.2"
        r="1.45"
        fill={soft}
        opacity={invert ? 0.9 : 0.35}
      />
    </svg>
  )
}

const GraphCoreLogo: React.FC<Props> = ({
  variant = 'wordmark',
  invert = false,
  className,
  title = 'GraphCore',
}) => {
  if (variant === 'mark') {
    return (
      <GraphCoreMark className={className} invert={invert} title={title} />
    )
  }

  return (
    <span
      className={`gc-logo${variant === 'compact' ? ' gc-logo-compact' : ''}${
        invert ? ' gc-logo-invert' : ''
      }${className ? ` ${className}` : ''}`}
    >
      <GraphCoreMark className="gc-logo-mark" invert={invert} title={title} />
      <span className="gc-logo-word">GRAPHCORE</span>
    </span>
  )
}

export default GraphCoreLogo
