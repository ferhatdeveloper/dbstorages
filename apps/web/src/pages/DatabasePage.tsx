import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Cpu,
  Database,
  HardDrive,
  MemoryStick,
  Plug,
  Table2,
} from 'lucide-react'
import { apiService, useCurrency } from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'
import { cartPath } from '../lib/cartPlans'
import {
  FALLBACK_DB_PLANS,
  mergeDbPlansFromApi,
  dbPlanDisplayAmount,
  type DbPlan,
} from '../data/plans'

function ramLabel(plan: DbPlan) {
  if (plan.ramMb >= 1024) return `${plan.ramMb / 1024} GB`
  return `${plan.ramMb} MB`
}

const DatabasePage: React.FC = () => {
  const { formatCents, fxHint } = useCurrency()
  const [plans, setPlans] = useState<DbPlan[]>(FALLBACK_DB_PLANS)
  const [billingInterval, setBillingInterval] = useState<'month' | 'year'>(
    'month'
  )

  useEffect(() => {
    apiService
      .getPackages()
      .then((res) => {
        if (res.data?.length) {
          setPlans(mergeDbPlansFromApi(res.data as DbPlan[]))
        }
      })
      .catch(() => {
        /* keep fallback */
      })
  }, [])

  return (
    <MarketingShell active="database">
      <section className="hz-hero hz-db-hero">
        <div className="hz-hero-inner">
          <div className="hz-hero-copy">
            <span className="hz-pill">Yönetilen Database</span>
            <h1>Gerçek Database, panelden anında</h1>
            <p>
              Table Editor, SQL Studio ve REST. Starter · Pro · Scale · Max ·
              Max+ — USD fiyatlarla büyütün. Ödeme sonrası connection string
              hazır.
            </p>
            <div className="hz-vps-hero-actions">
              <a href="#db-plans" className="hz-btn-ghost">
                Paketleri gör
                <ArrowRight size={18} />
              </a>
              <Link
                to={cartPath({ plan: 'starter', interval: 'month' })}
                className="hz-btn-solid hz-btn-on-hero"
              >
                Starter ile başla
              </Link>
            </div>
          </div>
          <div className="hz-hero-art hz-vps-hero-art" aria-hidden>
            <div className="hz-vps-spec-preview hz-db-spec-preview">
              <div>
                <span>Studio</span>
                <strong>SQL</strong>
              </div>
              <div>
                <span>Editor</span>
                <strong>Table</strong>
              </div>
              <div>
                <span>API</span>
                <strong>REST</strong>
              </div>
              <div>
                <span>Starter</span>
                <strong>$150/yıl</strong>
              </div>
            </div>
          </div>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </section>

      <main>
        <section className="hz-vps-trust" aria-label="Öne çıkanlar">
          <div>
            <Check size={16} />
            <span>Connection string anında</span>
          </div>
          <div>
            <Check size={16} />
            <span>Table Editor + SQL Studio</span>
          </div>
          <div>
            <Check size={16} />
            <span>€ / $ / ₺ anlık kur</span>
          </div>
          <div>
            <Check size={16} />
            <span>Yedekleme eklentisi</span>
          </div>
        </section>

        <section id="db-plans" className="hz-section hz-db-section">
          <h2 className="hz-section-title">Database paketleri</h2>
          <p className="hz-section-lead">
            Kaynaklar net: vCPU, RAM, disk, bağlantı ve object storage. Faturalama
            aylık veya yıllık.
          </p>
          {fxHint ? <p className="pricing-fx-hint hz-db-fx">{fxHint}</p> : null}

          <div
            className="hz-db-interval"
            role="group"
            aria-label="Faturalama aralığı"
          >
            <button
              type="button"
              className={billingInterval === 'month' ? 'is-active' : undefined}
              onClick={() => setBillingInterval('month')}
            >
              Aylık
            </button>
            <button
              type="button"
              className={billingInterval === 'year' ? 'is-active' : undefined}
              onClick={() => setBillingInterval('year')}
            >
              Yıllık
              <em>12 ay</em>
            </button>
          </div>

          <div className="hz-db-cards">
            {plans.map((plan) => {
              const amount = dbPlanDisplayAmount(plan, billingInterval)
              const isTrial = plan.priceCents === 0
              return (
                <article
                  key={plan.id}
                  className={`hz-db-card${plan.highlight ? ' is-featured' : ''}`}
                >
                  {plan.highlight ? (
                    <span className="hz-vps-badge">Popüler</span>
                  ) : null}
                  {isTrial ? (
                    <span className="hz-db-trial-tag">Trial</span>
                  ) : null}

                  <h3>{plan.name}</h3>
                  <p className="hz-db-card-desc">{plan.description}</p>

                  <p className="hz-db-card-price">
                    {isTrial
                      ? '15 gün ücretsiz'
                      : formatCents(amount, plan.currency || 'usd', {
                          maximumFractionDigits: 0,
                          minimumFractionDigits: 0,
                        })}
                    {!isTrial && (
                      <span>
                        /{billingInterval === 'year' ? 'yıl' : 'ay'}
                      </span>
                    )}
                  </p>

                  <dl className="hz-db-metrics">
                    <div>
                      <Cpu size={15} aria-hidden />
                      <dt>vCPU</dt>
                      <dd>{plan.vcpu}</dd>
                    </div>
                    <div>
                      <MemoryStick size={15} aria-hidden />
                      <dt>RAM</dt>
                      <dd>{ramLabel(plan)}</dd>
                    </div>
                    <div>
                      <HardDrive size={15} aria-hidden />
                      <dt>DB disk</dt>
                      <dd>{plan.diskGb} GB</dd>
                    </div>
                    <div>
                      <Database size={15} aria-hidden />
                      <dt>Storage</dt>
                      <dd>
                        {plan.storageGb != null ? `${plan.storageGb} GB` : '—'}
                      </dd>
                    </div>
                    <div className="hz-db-metric-wide">
                      <Plug size={15} aria-hidden />
                      <dt>Bağlantı</dt>
                      <dd>{plan.connections}</dd>
                    </div>
                  </dl>

                  <Link
                    to={cartPath({ plan: plan.id, interval: isTrial ? 'month' : billingInterval })}
                    className="hz-btn-solid hz-vps-card-cta"
                  >
                    {isTrial ? 'Sepete ekle — dene' : 'Sepete ekle'}
                    <ArrowRight size={16} />
                  </Link>
                </article>
              )
            })}
          </div>

          <div className="hz-vps-table-wrap hz-db-table-wrap">
            <table className="hz-vps-table">
              <thead>
                <tr>
                  <th>Paket</th>
                  <th>vCPU</th>
                  <th>RAM</th>
                  <th>Disk</th>
                  <th>Storage</th>
                  <th>Bağlantı</th>
                  <th>Fiyat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const amount = dbPlanDisplayAmount(plan, billingInterval)
                  const isTrial = plan.priceCents === 0
                  return (
                    <tr key={`row-${plan.id}`}>
                      <td>
                        <strong>{plan.name}</strong>
                        {plan.highlight ? (
                          <span className="hz-muted-line">Önerilen</span>
                        ) : null}
                      </td>
                      <td>{plan.vcpu}</td>
                      <td>{ramLabel(plan)}</td>
                      <td>{plan.diskGb} GB</td>
                      <td>
                        {plan.storageGb != null
                          ? `${plan.storageGb} GB`
                          : '—'}
                      </td>
                      <td>{plan.connections}</td>
                      <td className="hz-td-price">
                        {isTrial
                          ? 'Ücretsiz'
                          : formatCents(amount, plan.currency || 'usd', {
                              maximumFractionDigits: 0,
                              minimumFractionDigits: 0,
                            })}
                        {!isTrial && (
                          <span>
                            /{billingInterval === 'year' ? 'yıl' : 'ay'}
                          </span>
                        )}
                      </td>
                      <td>
                        <Link
                          to={cartPath({ plan: plan.id, interval: isTrial ? 'month' : billingInterval })}
                          className="hz-vps-row-cta"
                        >
                          Sepete
                          <ArrowRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="hz-db-features">
          <div className="hz-db-features-inner">
            <article>
              <Table2 size={22} />
              <h3>Table Editor</h3>
              <p>Şema ve satırları panelden düzenleyin — SQL zorunlu değil.</p>
            </article>
            <article>
              <Database size={22} />
              <h3>SQL Studio</h3>
              <p>Sorguları çalıştırın, sonuçları inceleyin, kaydedin.</p>
            </article>
            <article>
              <Plug size={22} />
              <h3>REST API</h3>
              <p>Instance açılır açılmaz connection string ve API erişimi.</p>
            </article>
          </div>
        </section>

        <section className="hz-cta-band">
          <h2>Database’inizi birkaç adımda açın</h2>
          <p>
            Paketi sepete ekleyin, ödemeyi sepette tamamlayın — connection string
            hazır. Panelden Table Editor ve SQL Studio ile yönetin.
          </p>
          <Link
            to={cartPath({ plan: 'starter', interval: 'month' })}
            className="hz-btn-solid"
          >
            Starter’ı sepete ekle
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>
    </MarketingShell>
  )
}

export default DatabasePage
