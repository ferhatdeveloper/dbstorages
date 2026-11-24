import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Cloud,
  Globe2,
  HardDrive,
  Shield,
  Zap,
} from 'lucide-react'
import { useCurrency } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'
import { useCart } from '../context/CartContext'
import {
  BACKUP_FEATURES,
  BACKUP_PLANS,
  BACKUP_REGIONS,
  type BackupPlan,
} from '../data/backupPlans'

const StoragePage: React.FC = () => {
  const { formatCents, fxHint } = useCurrency()
  const { addItem, billingInterval, setInterval } = useCart()
  const navigate = useNavigate()
  const [toast, setToast] = useState('')
  const [interval, setLocalInterval] = useState<'month' | 'year'>(
    billingInterval
  )

  const priceOf = (plan: BackupPlan) =>
    interval === 'year' ? plan.priceYearCents : plan.priceCents

  const addBackup = (plan: BackupPlan) => {
    setInterval(interval)
    addItem({
      type: 'addon',
      id: plan.id,
      name: plan.name,
      priceCents: plan.priceCents,
      currency: plan.currency,
      interval,
      meta: {
        priceYearCents: plan.priceYearCents,
        provider: 'veeam-backup',
        capacityGb: plan.capacityGb,
        description: plan.description,
      },
    })
    setToast(`${plan.name} sepete eklendi`)
    window.setTimeout(() => setToast(''), 2800)
  }

  return (
    <MarketingShell active="storage">
      <section className="hz-hero hz-storage-hero">
        <div className="hz-hero-inner">
          <div className="hz-hero-copy">
            <span className="hz-pill">Veeam Backup · QNAP NAS</span>
            <h1>QNAP NAS için Veeam Backup depolama</h1>
            <p>
              S3 uyumlu object storage — Veeam Backup &amp; Replication ve QNAP
              Hybrid Backup Sync ile doğrudan bağlanır. Kota, anahtar ve endpoint
              Studio’dan.
            </p>
            <div className="hz-vps-hero-actions">
              <a href="#backup-plans" className="hz-btn-ghost">
                Paketleri gör
                <ArrowRight size={18} />
              </a>
              <Link to="/cart" className="hz-btn-solid hz-btn-on-hero">
                Sepete git
              </Link>
            </div>
          </div>
          <div className="hz-hero-art hz-vps-hero-art" aria-hidden>
            <div className="hz-vps-spec-preview hz-storage-spec-preview">
              <div>
                <span>API</span>
                <strong>S3</strong>
              </div>
              <div>
                <span>Hedef</span>
                <strong>Veeam</strong>
              </div>
              <div>
                <span>Cihaz</span>
                <strong>QNAP</strong>
              </div>
              <div>
                <span>Bölge</span>
                <strong>EU+</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </section>

      <main>
        <section className="hz-section">
          <h2 className="hz-section-title">Neden bu depolama?</h2>
          <p className="hz-section-lead">
            NAS cihazlarınızı ve Veeam job’larınızı tek S3 repository’de toplayın —
            öngörülebilir kota, panelden yönetim.
          </p>
          <div className="hz-ops-grid" style={{ marginTop: '2rem' }}>
            {BACKUP_FEATURES.map((f) => (
              <div key={f.title}>
                <h3>
                  <Check
                    size={16}
                    style={{ display: 'inline', marginRight: 6 }}
                  />
                  {f.title}
                </h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="hz-section" id="backup-plans">
          <h2 className="hz-section-title">Backup paketleri</h2>
          <p className="hz-section-lead">
            Aylık veya yıllık. Ödeme sonrası Studio → Storage üzerinden S3
            endpoint, erişim anahtarı ve kota.
          </p>
          {fxHint ? <p className="pricing-fx-hint hz-backup-fx">{fxHint}</p> : null}
          <div
            className="hz-db-interval hz-backup-interval"
            role="group"
            aria-label="Dönem"
          >
            <button
              type="button"
              className={interval === 'month' ? 'is-active' : undefined}
              onClick={() => setLocalInterval('month')}
            >
              Aylık
            </button>
            <button
              type="button"
              className={interval === 'year' ? 'is-active' : undefined}
              onClick={() => setLocalInterval('year')}
            >
              Yıllık
            </button>
          </div>

          {toast && (
            <p className="hz-domain-msg is-ok" style={{ marginTop: '1rem' }}>
              {toast} — <Link to="/cart">Sepete git</Link>
            </p>
          )}

          <div className="hz-backup-grid">
            {BACKUP_PLANS.map((plan) => (
              <article
                key={plan.id}
                className={`hz-backup-card${plan.highlight ? ' is-hot' : ''}`}
              >
                {plan.highlight && (
                  <span className="hz-backup-badge">Önerilen</span>
                )}
                <div className="hz-backup-card-icon" aria-hidden>
                  <HardDrive size={22} />
                </div>
                <h3>{plan.name}</h3>
                <p className="hz-backup-cap">{plan.capacityLabel}</p>
                <p className="hz-backup-price">
                  {formatCents(priceOf(plan), 'usd', {
                    maximumFractionDigits: 2,
                    minimumFractionDigits: 0,
                  })}
                  <small>/{interval === 'year' ? 'yıl' : 'ay'}</small>
                </p>
                <p className="hz-backup-desc">{plan.description}</p>
                <ul className="hz-backup-features">
                  {plan.features.map((line) => (
                    <li key={line}>
                      <Check size={14} />
                      {line}
                    </li>
                  ))}
                </ul>
                <div className="hz-backup-actions">
                  <button
                    type="button"
                    className="hz-btn-solid"
                    onClick={() => addBackup(plan)}
                  >
                    Sepete ekle
                  </button>
                  <button
                    type="button"
                    className="hz-btn-ghost hz-btn-ghost-ink"
                    onClick={() => {
                      addBackup(plan)
                      navigate('/cart')
                    }}
                  >
                    Hemen öde
                    <ArrowRight size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="hz-section hz-backup-regions">
          <h2 className="hz-section-title">Bölgeler</h2>
          <p className="hz-section-lead">
            QNAP / Veeam job’larınızı yakın bölgeye yönlendirin. Avrupa varsayılan:
            Amsterdam / Frankfurt. Endpoint Studio’da görünür.
          </p>
          <div className="hz-backup-region-grid">
            {BACKUP_REGIONS.map((r) => (
              <div key={r.id} className="hz-backup-region">
                <Globe2 size={18} />
                <div>
                  <strong>
                    {r.flag} · {r.name}
                  </strong>
                  <span className="hz-backup-region-note">{r.note}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="hz-dual-band">
          <div className="hz-dual-inner">
            <article>
              <h2>
                <Cloud size={20} style={{ display: 'inline', marginRight: 8 }} />
                Volume &amp; VPS disk
              </h2>
              <p>
                Cloud sunucuya bağlı kalıcı volume’ler ayrı hizmettir. Veeam /
                QNAP object storage’dan bağımsızdır.
              </p>
              <Link to="/cloud" className="hz-link-arrow">
                Cloud sunucular
                <ArrowRight size={16} />
              </Link>
            </article>
            <article>
              <h2>
                <Shield size={20} style={{ display: 'inline', marginRight: 8 }} />
                Database kotası
              </h2>
              <p>
                Pro / Scale / Max planlarında dahil object storage GB’ı Studio
                bucket’ında; Backup paketleri Veeam ve QNAP için ek kota sağlar.
              </p>
              <Link to="/database" className="hz-link-arrow">
                Database paketleri
                <ArrowRight size={16} />
              </Link>
            </article>
          </div>
        </section>

        <section className="hz-cta-band">
          <h2>
            <Zap size={22} style={{ display: 'inline', marginRight: 8 }} />
            Backup kotasını sepete ekleyin
          </h2>
          <p>
            Polar veya kripto ile ödeyin; ardından Studio Storage’dan S3 uyumlu
            erişimi Veeam veya QNAP HBS3’e bağlayın.
          </p>
          <a href="#backup-plans" className="hz-btn-solid">
            Paket seç
            <ArrowRight size={18} />
          </a>
        </section>
      </main>
    </MarketingShell>
  )
}

export default StoragePage
