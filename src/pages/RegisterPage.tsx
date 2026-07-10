import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Lock, Mail, User, Check } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

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
    if (plan) {
      navigate(`/pricing?plan=${plan}`)
    } else {
      navigate('/app/dashboard')
    }
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
    <div className="landing-root min-h-screen flex items-center justify-center p-4">
      <div className="landing-grid" aria-hidden />
      <div className="relative z-10 max-w-md w-full">
        <div className="text-center mb-8">
          <Link to="/" className="landing-brand justify-center inline-flex">
            <span className="landing-mark" />
            GraphCore
          </Link>
          <p className="text-[var(--lc-muted)] mt-2">Hesap oluşturun</p>
        </div>

        <div className="billing-success-card">
          {error && <div className="pricing-error mb-4">{error}</div>}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm mb-1" htmlFor="firstName">Ad</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                  <input
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="landing-input pl-9"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm mb-1" htmlFor="lastName">Soyad</label>
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
              <label className="block text-sm mb-1" htmlFor="email">E-posta</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="landing-input pl-9"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="password">Şifre</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="landing-input pl-9 pr-10"
                  required
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {formData.password && (
                <p className={`text-xs mt-1 ${isPasswordValid ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isPasswordValid ? (
                    <span className="inline-flex items-center gap-1"><Check size={12} /> En az 8 karakter</span>
                  ) : (
                    'En az 8 karakter'
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm mb-1" htmlFor="confirmPassword">Şifre tekrarı</label>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                className="landing-input"
                required
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="agreeToTerms"
                checked={formData.agreeToTerms}
                onChange={handleInputChange}
                className="mt-1"
              />
              Kullanım şartlarını kabul ediyorum
            </label>
            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="landing-btn-primary w-full justify-center disabled:opacity-50"
            >
              {loading ? 'Kaydediliyor…' : 'Hesap oluştur'}
            </button>
            <p className="text-center text-sm text-[var(--lc-muted)]">
              Zaten hesabınız var mı?{' '}
              <Link to="/login" className="text-[var(--lc-accent)] font-medium">
                Giriş yapın
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
