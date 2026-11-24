import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/ThemeToggle'

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const success = await login(formData.email, formData.password)
      if (success) {
        const from = (location.state as any)?.from?.pathname || '/app/dashboard'
        navigate(from, { replace: true })
      } else {
        setError('Giriş başarısız. Lütfen bilgilerinizi kontrol edin.')
      }
    } catch {
      setError('Bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  return (
    <div className="landing-root min-h-screen flex items-center justify-center p-4">
      <div className="landing-grid" aria-hidden />
      <div className="relative z-10 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-3">
            <Link to="/" className="landing-brand justify-center inline-flex">
              <span className="landing-mark" />
              dbstorages
            </Link>
            <ThemeToggle />
          </div>
          <p className="text-[var(--lc-muted)] mt-2">Hesabınıza giriş yapın</p>
        </div>

        <div className="billing-success-card">
          {error && <div className="pricing-error mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1" htmlFor="email">
                E-posta
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="landing-input pl-9"
                  required
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="password">
                Şifre
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="landing-input pl-9 pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--lc-muted)]">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleInputChange}
              />
              Beni hatırla
            </label>
            <button
              type="submit"
              className="landing-btn-primary w-full justify-center disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--lc-muted)]">
            Hesabınız yok mu?{' '}
            <Link to="/register" className="text-[var(--lc-accent)] font-medium">
              Kayıt olun
            </Link>
            {' · '}
            <Link to="/pricing" className="hover:underline">
              Paketler
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
