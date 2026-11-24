import React from 'react'

type Props = {
  /** mark | wordmark (mark + text) | compact (small mark + text) */
  variant?: 'mark' | 'wordmark' | 'compact'
  /** Invert for dark/blue footer backgrounds */
  invert?: boolean
  className?: string
  title?: string
}

const BRAND = 'dbstorages'

/** Refined storage mark: soft plate + layered disks + accent pulse */
export function GraphCoreMark({
  className,
  invert = false,
  title = BRAND,
}: {
  className?: string
  invert?: boolean
  title?: string
}) {
  const uid = React.useId().replace(/:/g, '')

  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      width="40"
      height="40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      aria-label={title || undefined}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id={`dbs-plate-${uid}`} x1="6" y1="2" x2="36" y2="38">
          <stop stopColor={invert ? '#ffffff' : '#0B5BC7'} />
          <stop offset="1" stopColor={invert ? '#ffffff' : '#073A7A'} />
        </linearGradient>
        <linearGradient id={`dbs-disk-${uid}`} x1="12" y1="8" x2="28" y2="30">
          <stop stopColor="#ffffff" stopOpacity="1" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.82" />
        </linearGradient>
        <filter
          id={`dbs-soft-${uid}`}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
        >
          <feGaussianBlur stdDeviation="0.35" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect
        width="40"
        height="40"
        rx="11"
        fill={`url(#dbs-plate-${uid})`}
        opacity={invert ? 0.16 : 1}
      />
      {invert ? (
        <rect
          x="0.6"
          y="0.6"
          width="38.8"
          height="38.8"
          rx="10.4"
          stroke="rgba(255,255,255,0.35)"
          strokeWidth="1.2"
        />
      ) : null}

      {/* layered disks */}
      <g filter={`url(#dbs-soft-${uid})`}>
        <ellipse
          cx="20"
          cy="12.2"
          rx="10.2"
          ry="3.4"
          fill={`url(#dbs-disk-${uid})`}
        />
        <path
          d="M9.8 12.2v3.8c0 1.9 4.55 3.4 10.2 3.4s10.2-1.5 10.2-3.4v-3.8"
          fill={`url(#dbs-disk-${uid})`}
          opacity="0.92"
        />
        <ellipse
          cx="20"
          cy="19.4"
          rx="10.2"
          ry="3.25"
          fill="#fff"
          opacity="0.88"
        />
        <path
          d="M9.8 19.4v3.7c0 1.85 4.55 3.3 10.2 3.3s10.2-1.45 10.2-3.3v-3.7"
          fill="#fff"
          opacity="0.78"
        />
        <ellipse
          cx="20"
          cy="26.4"
          rx="10.2"
          ry="3.15"
          fill="#fff"
          opacity="0.72"
        />
        <path
          d="M9.8 26.4v3.5c0 1.8 4.55 3.2 10.2 3.2s10.2-1.4 10.2-3.2v-3.5"
          fill="#fff"
          opacity="0.62"
        />
      </g>

      {/* accent pulse */}
      <circle cx="29.4" cy="12.4" r="2.35" fill="#E11D3A" />
      <circle cx="29.4" cy="12.4" r="3.6" stroke="#E11D3A" strokeOpacity="0.35" />
      <circle cx="12.2" cy="27" r="1.35" fill="#E11D3A" opacity="0.85" />
    </svg>
  )
}

export const DbStoragesMark = GraphCoreMark

function Wordmark({ invert }: { invert?: boolean }) {
  return (
    <span className={`gc-logo-word${invert ? ' is-invert' : ''}`} aria-label={BRAND}>
      <span className="gc-logo-word-db">db</span>
      <span className="gc-logo-word-rest">storages</span>
    </span>
  )
}

const GraphCoreLogo: React.FC<Props> = ({
  variant = 'wordmark',
  invert = false,
  className,
  title = BRAND,
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
      title={title}
    >
      <GraphCoreMark className="gc-logo-mark" invert={invert} title="" />
      <Wordmark invert={invert} />
    </span>
  )
}

export const DbStoragesLogo = GraphCoreLogo
export default GraphCoreLogo
