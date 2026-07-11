import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import PricingPage from './pages/PricingPage'
import BillingSuccessPage from './pages/BillingSuccessPage'
import { CONSOLE_URL } from '@graphcore/shared'

function ConsoleRedirect({ to = '/dashboard' }: { to?: string }) {
  React.useEffect(() => {
    window.location.assign(`${CONSOLE_URL}${to}`)
  }, [to])
  return (
    <div className="landing-root flex min-h-screen items-center justify-center p-6 text-[var(--lc-muted)]">
      Console’a yönlendiriliyor…
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/billing/success" element={<BillingSuccessPage />} />
      {/* Old studio URLs → console */}
      <Route path="/app/*" element={<ConsoleRedirect to="/dashboard" />} />
      <Route path="/app" element={<ConsoleRedirect to="/dashboard" />} />
      <Route path="/cloud/*" element={<ConsoleRedirect to="/cloud/servers" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
