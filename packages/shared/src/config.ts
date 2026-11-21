/** Cross-app URLs — set via Vite env in each app. */

function env(name: string): string {
  try {
    return (
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[name] ||
      ''
    )
  } catch {
    return ''
  }
}

function runtimeOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin
  }
  return ''
}

const isDev = (() => {
  try {
    return !!(import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV
  } catch {
    return false
  }
})()

/** Marketing site origin (no trailing slash). */
export const WEB_URL = (
  env('VITE_WEB_URL') ||
  (isDev ? 'http://localhost:5173' : runtimeOrigin()) ||
  'http://localhost:5173'
).replace(/\/$/, '')

/**
 * Console origin (no trailing slash).
 * Dev: :5174 — Prod (same host): /app path prefix via VITE_CONSOLE_URL or origin+/app
 */
export const CONSOLE_URL = (
  env('VITE_CONSOLE_URL') ||
  (isDev ? 'http://localhost:5174' : `${runtimeOrigin()}/app`) ||
  'http://localhost:5174'
).replace(/\/$/, '')

export function consolePath(path = '/dashboard'): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${CONSOLE_URL}${p}`
}

export function webPath(path = '/'): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return `${WEB_URL}${p}`
}

/** After login/register on marketing site → open console with JWT. */
export function redirectToConsole(token: string, path = '/dashboard') {
  const u = new URL(consolePath(path), runtimeOrigin() || 'http://localhost:5174')
  u.searchParams.set('token', token)
  window.location.assign(u.toString())
}

/** Console unauthenticated → marketing login, then back. */
export function redirectToWebLogin(returnPath?: string) {
  const url = new URL(webPath('/login'), runtimeOrigin() || 'http://localhost:5173')
  if (returnPath) {
    const next = returnPath.startsWith('http')
      ? returnPath
      : consolePath(returnPath)
    url.searchParams.set('next', next)
  }
  window.location.assign(url.toString())
}

export function consumeAuthTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  if (!token) return null
  params.delete('token')
  const qs = params.toString()
  const clean = `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
  window.history.replaceState({}, '', clean)
  return token
}
