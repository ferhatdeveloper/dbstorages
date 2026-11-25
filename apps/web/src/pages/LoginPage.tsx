import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useAuth, redirectToConsole, CONSOLE_URL } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  })
  const [params] = useSearchParams()
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
        const token = localStorage.getItem('token') || ''
        const next = params.get('next') || (location.state as any)?.from
        if (next && typeof next === 'string' && next.startsWith('http')) {
          const url = new URL(next)
          url.searchParams.set('token', token)
          window.location.assign(url.toString())
          return
        }
        if (next && typeof next === 'string' && next.startsWith('/')) {
          navigate(next)
          return
        }
        const consolePath = (location.state as any)?.consolePath as string | undefined
        redirectToConsole(token, consolePath || '/dashboard')
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
    <MarketingShell variant="auth" active="login">
      <div className="hz-auth-stage">
        <div className="hz-auth-card">
          <div className="hz-auth-head">
            <h1>Giriş yap</h1>
            <p>
              Hesabınıza giriş yapın. Başarılı giriş sonrası Console açılır (
              {CONSOLE_URL}).
            </p>
          </div>

          {error && <div className="pricing-error mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="hz-auth-form">
            <div>
              <label htmlFor="email">E-posta</label>
              <div className="hz-input-wrap">
                <Mail className="hz-input-icon" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="landing-input"
                  required
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label htmlFor="password">Şifre</label>
              <div className="hz-input-wrap">
                <Lock className="hz-input-icon" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={handleInputChange}
                  className="landing-input hz-input-pad-r"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="hz-input-toggle"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label="Şifreyi göster"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="hz-check">
              <input
                type="checkbox"
                name="rememberMe"
                checked={formData.rememberMe}
                onChange={handleInputChange}
              />
              Beni hatırla
            </label>
            <button type="submit" className="hz-btn-solid hz-btn-block" disabled={loading}>
              {loading ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>
          </form>

          <p className="hz-auth-foot">
            Hesabınız yok mu?{' '}
            <Link to="/register">Kayıt olun</Link>
          </p>
        </div>
      </div>
    </MarketingShell>
  )
}

export default LoginPage
