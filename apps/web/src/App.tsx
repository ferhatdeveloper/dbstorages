import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import CloudPage from './pages/CloudPage'
import DatabasePage from './pages/DatabasePage'
import StoragePage from './pages/StoragePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import CartPage from './pages/CartPage'
import DomainSearchPage from './pages/DomainSearchPage'
import BillingSuccessPage from './pages/BillingSuccessPage'
import CryptoPayPage from './pages/CryptoPayPage'
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
      <Route path="/cloud" element={<CloudPage />} />
      <Route path="/database" element={<DatabasePage />} />
      <Route path="/storage" element={<StoragePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/pricing" element={<Navigate to="/database" replace />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/domains" element={<DomainSearchPage />} />
      <Route path="/billing/success" element={<BillingSuccessPage />} />
      <Route path="/billing/crypto" element={<CryptoPayPage />} />
      {/* Old studio URLs → console */}
      <Route path="/app/*" element={<ConsoleRedirect to="/dashboard" />} />
      <Route path="/app" element={<ConsoleRedirect to="/dashboard" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
