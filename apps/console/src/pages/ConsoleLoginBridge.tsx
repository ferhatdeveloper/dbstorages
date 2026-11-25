import React, { useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { redirectToWebLogin, WEB_URL } from '../lib/urls'

/**
 * Console has no marketing login UI.
 * /login here either accepts ?token= (AuthProvider) or sends user to web.
 * Always stay under /app basename — never replace('/dashboard') on the host root
 * (that leaves console and can bounce login ↔ /app forever).
 */
const ConsoleLoginBridge: React.FC = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const sent = useRef(false)

  useEffect(() => {
    if (sent.current) return
    const hasToken =
      Boolean(params.get('token')) || Boolean(localStorage.getItem('token'))
    if (hasToken) {
      sent.current = true
      navigate('/dashboard', { replace: true })
      return
    }
    sent.current = true
    redirectToWebLogin('/dashboard')
  }, [params, navigate])

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
