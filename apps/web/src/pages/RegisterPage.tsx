import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, User, Check } from 'lucide-react'
import { useAuth, redirectToConsole } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'

const RegisterPage = () => {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    agreeToTerms: false,
  })
  const navigate = useNavigate()
  const location = useLocation()
  const { register } = useAuth()
  const plan = (location.state as any)?.plan

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await register({
      email: formData.email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName,
    })
    setLoading(false)
    if (!result.ok) {
      setError(result.error || 'Kayıt başarısız')
      return
    }
    const from = (location.state as any)?.from as string | undefined
    const interval = (location.state as any)?.interval as string | undefined
    const backup = Boolean((location.state as any)?.backup)
    if (from && String(from).startsWith('/')) {
      navigate(from)
      return
    }
    if (plan) {
      const qs = new URLSearchParams({ plan: String(plan) })
      if (interval === 'year') qs.set('interval', 'year')
      if (backup) qs.set('backup', '1')
      navigate(`/cart?${qs.toString()}`)
      return
    }
    const consolePath = (location.state as any)?.consolePath as string | undefined
    const token = localStorage.getItem('token') || ''
    redirectToConsole(token, consolePath || '/dashboard')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const isPasswordValid = formData.password.length >= 8
  const isPasswordMatch = formData.password === formData.confirmPassword
  const isFormValid =
    formData.firstName &&
    formData.lastName &&
    formData.email &&
    isPasswordValid &&
    isPasswordMatch &&
    formData.agreeToTerms

  return (
    <MarketingShell variant="auth" active="register">
      <div className="hz-auth-stage">
        <div className="hz-auth-card">
          <div className="hz-auth-head">
            <h1>Hesap oluştur</h1>
            <p>Cloud sunucu ve yönetilen Database için kaydolun.</p>
          </div>

          {error && <div className="pricing-error mb-4">{error}</div>}

          <form onSubmit={handleSubmit} className="hz-auth-form">
            <div className="hz-auth-row">
              <div>
                <label htmlFor="firstName">Ad</label>
                <div className="hz-input-wrap">
                  <User className="hz-input-icon" />
                  <input
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="landing-input"
                    required
                  />
                </div>
              </div>
              <div>
                <label htmlFor="lastName">Soyad</label>
                <input
                  id="lastName"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleInputChange}
                  className="landing-input"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="email">E-posta</label>
              <div className="hz-input-wrap">
                <Mail className="hz-input-icon" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="landing-input"
                  required
                />
              </div>
            </div>
            <div>
              <label htmlFor="password">Şifre</label>
              <div className="hz-input-wrap">
                <Lock className="hz-input-icon" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="landing-input hz-input-pad-r"
                  required
                />
                <button
                  type="button"
                  className="hz-input-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {formData.password && (
                <p className={`hz-hint ${isPasswordValid ? 'is-ok' : 'is-bad'}`}>
                  {isPasswordValid ? (
                    <span className="inline-flex items-center gap-1">
                      <Check size={12} /> En az 8 karakter
                    </span>
                  ) : (
                    'En az 8 karakter'
                  )}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="confirmPassword">Şifre tekrarı</label>
              <div className="hz-input-wrap">
                <Lock className="hz-input-icon" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="landing-input hz-input-pad-r"
                  required
                />
                <button
                  type="button"
                  className="hz-input-toggle"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <label className="hz-check">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleInputChange}
              />
              Kullanım şartlarını kabul ediyorum
            </label>
            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="hz-btn-solid hz-btn-block disabled:opacity-50"
            >
              {loading ? 'Kaydediliyor…' : 'Hesap oluştur'}
            </button>
          </form>

          <p className="hz-auth-foot">
            Zaten hesabınız var mı? <Link to="/login">Giriş yapın</Link>
          </p>
        </div>
      </div>
    </MarketingShell>
  )
}

export default RegisterPage
