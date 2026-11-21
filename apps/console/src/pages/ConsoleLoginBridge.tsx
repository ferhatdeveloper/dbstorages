import React, { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { redirectToWebLogin, WEB_URL } from '../lib/urls'

/**
 * Console has no marketing login UI.
 * /login here either accepts ?token= (AuthProvider) or sends user to web.
 */
const ConsoleLoginBridge: React.FC = () => {
  const [params] = useSearchParams()

  useEffect(() => {
    if (params.get('token')) {
      // AuthProvider already consumed token on boot; go home
      window.location.replace('/dashboard')
      return
    }
    redirectToWebLogin('/dashboard')
  }, [params])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-slate-300">
      <p className="text-sm">Marketing girişine yönlendiriliyor…</p>
      <a className="text-xs text-red-500 underline" href={`${WEB_URL}/login`}>
        {WEB_URL}/login
      </a>
    </div>
  )
}

export default ConsoleLoginBridge
