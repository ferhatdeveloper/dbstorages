import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { translate } from '../i18n/messages'
import {
  type AppLocale,
  LOCALE_STORAGE_KEY,
  detectBrowserLocale,
  isAppLocale,
} from '../i18n/types'

type LocaleContextValue = {
  locale: AppLocale
  setLocale: (locale: AppLocale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

function readStoredLocale(): AppLocale {
  try {
    const raw = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (isAppLocale(raw)) return raw
  } catch {
    /* ignore */
  }
  return detectBrowserLocale()
}

function applyDocumentLang(locale: AppLocale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [locale, setLocaleState] = useState<AppLocale>(() => readStoredLocale())

  useEffect(() => {
    applyDocumentLang(locale)
  }, [locale])

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next)
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
    applyDocumentLang(next)
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) =>
      translate(locale, key, vars),
    [locale]
  )

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  )

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider')
  }
  return ctx
}

export function useLocaleOptional() {
  return useContext(LocaleContext)
}
