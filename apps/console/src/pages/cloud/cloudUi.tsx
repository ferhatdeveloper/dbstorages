import React, { useEffect } from 'react'
import { Loader2, RefreshCw, X } from 'lucide-react'

/** Shared field styles — teal/lime console tokens, dark-mode ready */
export const cloudFieldClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-1 focus:ring-teal-600/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-lime-500 dark:focus:ring-lime-500/20'

export const cloudBtnPrimary =
  'inline-flex items-center justify-center gap-1.5 rounded-md bg-teal-700 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:opacity-50 dark:bg-lime-500 dark:text-slate-900 dark:hover:bg-lime-400'

export const cloudBtnGhost =
  'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'

export const cloudPanelClass =
  'rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'

export const cloudTableWrap =
  'overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700'

export const cloudThead =
  'bg-slate-50/90 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:bg-slate-800/80 dark:text-slate-400'

export const cloudTh = 'px-3 py-2 text-left whitespace-nowrap'
export const cloudTd = 'px-3 py-2 align-middle'
export const cloudTr = 'border-t border-slate-100 transition hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40'

const STATUS_STYLES: Record<string, string> = {
  running: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  online: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  off: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  offline: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  stopped: 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  creating: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  provisioning: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  initializing: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  starting: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  deleting: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  full: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  stub: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

export function CloudStatusPill({ status }: { status?: string | null }) {
  const raw = String(status || '—')
  const key = raw.toLowerCase().replace(/\s+/g, '_')
  const style = STATUS_STYLES[key] || 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${style}`}>
      {raw}
    </span>
  )
}

type PageHeaderProps = {
  title: string
  description?: string
  onRefresh?: () => void
  refreshing?: boolean
  actions?: React.ReactNode
}

export function CloudPageHeader({ title, description, onRefresh, refreshing, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2
          className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100"
          style={{ fontFamily: 'Syne, sans-serif' }}
        >
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={cloudBtnGhost}
            title="Yenile"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        )}
        {actions}
      </div>
    </div>
  )
}

type EmptyStateProps = {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}

export function CloudEmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-500">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

type SlideOverProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  wide?: boolean
  children: React.ReactNode
  footer?: React.ReactNode
}

export function CloudSlideOver({
  open,
  onClose,
  title,
  subtitle,
  wide,
  children,
  footer,
}: SlideOverProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Kapat"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] transition dark:bg-black/55"
        onClick={onClose}
      />
      <aside
        className={`relative flex h-full w-full flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cloud-slide-title"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
          <div className="min-w-0">
            <h3
              id="cloud-slide-title"
              className="text-sm font-semibold text-slate-900 dark:text-slate-100"
              style={{ fontFamily: 'Syne, sans-serif' }}
            >
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className={cloudBtnGhost} aria-label="Kapat">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  )
}

export function CloudLoading() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  )
}

export function CloudError({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
      {message}
    </div>
  )
}

export const SIZE_FAMILIES = [
  {
    id: 'cx',
    label: 'CX',
    familyLabel: 'CX — Uygun maliyet / genel amaç',
    hint: 'Paylaşımlı · Intel',
    descriptionTr:
      'Paylaşımlı Intel vCPU. Web, staging ve hafif uygulamalar için ekonomik seçenek.',
  },
  {
    id: 'cpx',
    label: 'CPX',
    familyLabel: 'CPX — Daha yüksek performans',
    hint: 'Paylaşımlı · AMD',
    descriptionTr:
      'Paylaşımlı AMD vCPU. Daha fazla disk ve daha yüksek performans ihtiyacı için.',
  },
  {
    id: 'cax',
    label: 'CAX',
    familyLabel: 'CAX — ARM, fiyat/performans',
    hint: 'ARM · Ampere',
    descriptionTr:
      'Ampere ARM mimarisi. Bulut-native iş yüklerinde güçlü fiyat/performans.',
  },
  {
    id: 'ccx',
    label: 'CCX',
    familyLabel: 'CCX — Dedicated vCPU, üretim',
    hint: 'Dedicated vCPU',
    descriptionTr:
      'Ayrılmış (dedicated) vCPU. Üretim, veritabanı ve tutarlı performans gereken iş yükleri.',
  },
] as const

export function detectSizeFamily(name: string, family?: string | null) {
  const f = (family || '').toLowerCase()
  if (f) return f
  const n = name.toLowerCase()
  if (n.startsWith('cax')) return 'cax'
  if (n.startsWith('ccx')) return 'ccx'
  if (n.startsWith('cpx')) return 'cpx'
  if (n.startsWith('cx')) return 'cx'
  return 'other'
}
