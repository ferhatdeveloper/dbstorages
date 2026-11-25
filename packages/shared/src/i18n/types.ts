export type AppLocale = 'tr' | 'en' | 'de'

export const LOCALES: readonly AppLocale[] = ['tr', 'en', 'de'] as const

export const LOCALE_META: Record<
  AppLocale,
  { label: string; short: string; native: string }
> = {
  tr: { label: 'Turkish', short: 'TR', native: 'Türkçe' },
  en: { label: 'English', short: 'EN', native: 'English' },
  de: { label: 'German', short: 'DE', native: 'Deutsch' },
}

export const LOCALE_STORAGE_KEY = 'dbstorages-locale'

export function isAppLocale(value: unknown): value is AppLocale {
  return value === 'tr' || value === 'en' || value === 'de'
}

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === 'undefined') return 'tr'
  const raw = (navigator.language || 'tr').toLowerCase()
  if (raw.startsWith('de')) return 'de'
  if (raw.startsWith('en')) return 'en'
  if (raw.startsWith('tr')) return 'tr'
  return 'tr'
}
