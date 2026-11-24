import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiService, useAuth, useCurrency } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'

const PAY_ASSET_LABEL: Record<string, string> = {
  usdttrc20: 'USDT (TRC-20)',
  usdt: 'USDT',
  btc: 'Bitcoin',
  eth: 'Ethereum',
  ltc: 'Litecoin',
}

const MOCK_WALLETS: Record<string, string> = {
  usdttrc20: 'TXdemoDbstoragesUsdtTrc20Wallet9a2f',
  usdt: '0xDemoDbstoragesUsdtErc20Wallet0001',
  btc: 'bc1qdemoDbstoragesBtcWallet00000001',
  eth: '0xDemoDbstoragesEthWallet0000000001',
  ltc: 'ltc1qdemoDbstoragesLtcWallet000001',
}

const CryptoPayPage: React.FC = () => {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()
  const { formatCents } = useCurrency()
  const paymentId = params.get('paymentId') || ''
  const payAsset = (params.get('pay') || 'usdttrc20').toLowerCase()
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [payment, setPayment] = useState<{
    amountCents?: number
    currency?: string
    planId?: string
    status?: string
    mock?: boolean
    payCurrency?: string
  } | null>(null)

  const amountHint = params.get('amount')
  const currencyHint = (params.get('currency') || 'usd').toLowerCase()

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: `/billing/crypto?${params.toString()}` } })
      return
    }
    if (!paymentId) {
      setError('Ödeme kimliği yok')
      setLoading(false)
      return
    }
    apiService
      .cryptoPayment(paymentId)
      .then((res) => setPayment(res.data))
      .catch((e) => setError(e.message || 'Ödeme yüklenemedi'))
      .finally(() => setLoading(false))
  }, [isAuthenticated, paymentId, navigate, params])

  const amountCents = payment?.amountCents ?? Math.round(Number(amountHint || 0) * 100)
  const currency = payment?.currency || currencyHint
  const asset = (payment?.payCurrency || payAsset).toLowerCase()
  const wallet = MOCK_WALLETS[asset] || MOCK_WALLETS.usdttrc20
  const assetLabel = PAY_ASSET_LABEL[asset] || asset.toUpperCase()

  const alreadyPaid = String(payment?.status || '').toLowerCase() === 'succeeded'

  const copyWallet = async () => {
    try {
      await navigator.clipboard.writeText(wallet)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  const confirm = async () => {
    setConfirming(true)
    setError('')
    try {
      const res = await apiService.cryptoConfirm(paymentId)
      const url = res.data?.redirectUrl || `/billing/success?provider=crypto&paymentId=${paymentId}`
      if (/^https?:\/\//i.test(url)) {
        const u = new URL(url)
        navigate(u.pathname + u.search)
      } else {
        navigate(url)
      }
    } catch (e: any) {
      setError(e.message || 'Onaylanamadı')
    } finally {
      setConfirming(false)
    }
  }

  const note = useMemo(() => {
    if (payment?.mock === false) {
      return 'Canlı kripto: ödeme ağa düşünce otomatik onaylanır (IPN).'
    }
    return 'Demo mod: gerçek zincir transferi yok. Onayladığınızda sipariş tamamlanır.'
  }, [payment?.mock])

  return (
    <MarketingShell>
      <div className="hz-page-band hz-page-band-sm">
        <div className="hz-page-band-inner">
          <span className="hz-pill">Kripto</span>
          <h1>Kripto ile öde</h1>
          <p>USDT / BTC / ETH — ağ onayı sonrası hizmet açılır.</p>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </div>

      <main className="hz-crypto-page">
        {loading && <p className="hz-crypto-muted">Ödeme yükleniyor…</p>}
        {error && <div className="hz-crypto-alert is-err">{error}</div>}

        {!loading && !error && alreadyPaid && (
          <div className="hz-crypto-card">
            <h2>Ödeme alınmış</h2>
            <p>Bu sipariş zaten tamamlandı.</p>
            <Link
              to={`/billing/success?provider=crypto&paymentId=${encodeURIComponent(paymentId)}`}
              className="hz-btn-solid"
            >
              Sonuca git
            </Link>
          </div>
        )}

        {!loading && !alreadyPaid && (
          <div className="hz-crypto-card">
            <div className="hz-crypto-row">
              <span>Tutar</span>
              <strong>
                {formatCents(amountCents, currency, {
                  maximumFractionDigits: 2,
                  minimumFractionDigits: 2,
                })}
              </strong>
            </div>
            <div className="hz-crypto-row">
              <span>Varlık</span>
              <strong>{assetLabel}</strong>
            </div>
            <div className="hz-crypto-row">
              <span>Sipariş</span>
              <code>{paymentId || '—'}</code>
            </div>

            <div className="hz-crypto-wallet">
              <p className="hz-crypto-wallet-label">Alıcı cüzdan (demo)</p>
              <code>{wallet}</code>
              <button type="button" className="hz-btn-ghost" onClick={copyWallet}>
                {copied ? 'Kopyalandı' : 'Adresi kopyala'}
              </button>
            </div>

            <p className="hz-crypto-note">{note}</p>

            <div className="hz-crypto-actions">
              <button
                type="button"
                className="hz-btn-solid"
                disabled={confirming || !paymentId}
                onClick={confirm}
              >
                {confirming ? 'Onaylanıyor…' : 'Ödemeyi onayla'}
              </button>
              <Link to="/cart" className="hz-btn-ghost">
                Sepete dön
              </Link>
            </div>
          </div>
        )}
      </main>
    </MarketingShell>
  )
}

export default CryptoPayPage
