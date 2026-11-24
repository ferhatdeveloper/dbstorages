import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Check, Cpu, HardDrive, MemoryStick, Network } from 'lucide-react'
import {
  apiService,
  useAuth,
  useCurrency,
  CONSOLE_URL,
  SIZE_FAMILIES,
  VPS_POPULAR_FALLBACK,
  type VpsServerType,
} from '@graphcore/shared'
import MarketingShell from '../components/MarketingShell'

type FamilyFilter = 'all' | 'cx' | 'cpx' | 'cax' | 'ccx'

function planFamily(p: VpsServerType): string {
  if (p.family) return p.family.toLowerCase()
  const n = (p.name || '').toLowerCase()
  if (n.startsWith('cax')) return 'cax'
  if (n.startsWith('ccx')) return 'ccx'
  if (n.startsWith('cpx')) return 'cpx'
  if (n.startsWith('cx')) return 'cx'
  return 'cx'
}

function memGb(p: VpsServerType) {
  return p.memoryGb ?? p.memory ?? null
}

function diskGb(p: VpsServerType) {
  return p.diskGb ?? p.disk ?? null
}

const CloudPage: React.FC = () => {
  const { formatAmount } = useCurrency()
  const { isAuthenticated } = useAuth()
  const cloudHref = `${CONSOLE_URL}/cloud/servers`
  const loginHref = `/login?next=${encodeURIComponent(cloudHref)}`

  const openConsole = () => {
    if (isAuthenticated) {
      window.location.href = cloudHref
      return
    }
    window.location.href = loginHref
  }

  const [allPlans, setAllPlans] = useState<VpsServerType[]>(VPS_POPULAR_FALLBACK)
  const [family, setFamily] = useState<FamilyFilter>('all')

  useEffect(() => {
    apiService
      .getPackages()
      .then((res) => {
        const list =
          res.vpsCatalog?.serverTypes?.length
            ? res.vpsCatalog.serverTypes
            : res.vpsCatalog?.popularPlans
        if (list?.length) setAllPlans(list)
      })
      .catch(() => {
        /* keep fallback */
      })
  }, [])

  const filtered = useMemo(() => {
    if (family === 'all') return allPlans
    return allPlans.filter((p) => planFamily(p) === family)
  }, [allPlans, family])

  const featured = useMemo(() => {
    const popular = filtered.filter((p) => p.popular)
    const pool = popular.length ? popular : filtered
    return pool.slice(0, 3)
  }, [filtered])

  const activeFamilyMeta =
    family === 'all' ? null : SIZE_FAMILIES.find((f) => f.id === family)

  return (
    <MarketingShell active="cloud">
      <section className="hz-hero hz-vps-hero">
        <div className="hz-hero-inner">
          <div className="hz-hero-copy">
            <span className="hz-pill">Cloud sunucu</span>
            <h1>Cloud sunucunuzu dakikalar içinde açın</h1>
            <p>
              Şeffaf EUR fiyat, net kaynaklar. VPS kart sepetinde satılmaz —
              giriş yapıp Console → Cloud panelinden region, image ve SSH ile
              açın.
            </p>
            <div className="hz-vps-hero-actions">
              <a href="#vps-plans" className="hz-btn-ghost">
                Planları gör
                <ArrowRight size={18} />
              </a>
              <button
                type="button"
                className="hz-btn-solid hz-btn-on-hero"
                onClick={openConsole}
              >
                Console’da aç
              </button>
            </div>
          </div>
          <div className="hz-hero-art hz-vps-hero-art" aria-hidden>
            <div className="hz-vps-spec-preview">
              <div>
                <span>vCPU</span>
                <strong>2–16+</strong>
              </div>
              <div>
                <span>RAM</span>
                <strong>4–64 GB</strong>
              </div>
              <div>
                <span>Disk</span>
                <strong>40–360 GB</strong>
              </div>
              <div>
                <span>Trafik</span>
                <strong>20 TB</strong>
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
            <span>EUR perakende · şeffaf markup</span>
          </div>
          <div>
            <Check size={16} />
            <span>Avrupa region · GDPR</span>
          </div>
          <div>
            <Check size={16} />
            <span>Firewall, volume, SSH key</span>
          </div>
          <div>
            <Check size={16} />
            <span>Panelden provision (sepet dışı)</span>
          </div>
        </section>

        <section id="vps-plans" className="hz-section hz-vps-section">
          <h2 className="hz-section-title">Sunucu aileleri</h2>
          <p className="hz-section-lead">
            {activeFamilyMeta?.descriptionTr ||
              'İhtiyacınıza göre aile seçin. Fiyatlar aylık perakende EUR. Ödeme ve açılış Console üzerinden.'}
          </p>

          <div className="hz-vps-filters" role="tablist" aria-label="Sunucu ailesi">
            <button
              type="button"
              role="tab"
              aria-selected={family === 'all'}
              className={family === 'all' ? 'is-active' : undefined}
              onClick={() => setFamily('all')}
            >
              Tümü
            </button>
            {SIZE_FAMILIES.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={family === f.id}
                className={family === f.id ? 'is-active' : undefined}
                onClick={() => setFamily(f.id as FamilyFilter)}
              >
                <strong>{f.label}</strong>
                <em>{f.hint}</em>
              </button>
            ))}
          </div>

          <div className="hz-vps-cards">
            {featured.map((p, idx) => {
              const mid = Math.min(1, featured.length - 1)
              const isHot = idx === mid
              return (
                <article
                  key={p.name}
                  className={`hz-vps-card${isHot ? ' is-featured' : ''}`}
                >
                  {isHot ? <span className="hz-vps-badge">Önerilen</span> : null}
                  <p className="hz-vps-card-family">
                    {SIZE_FAMILIES.find((f) => f.id === planFamily(p))?.label ||
                      planFamily(p).toUpperCase()}
                  </p>
                  <h3>{(p.description || p.name).toUpperCase()}</h3>
                  {p.useCaseHint ? (
                    <p className="hz-vps-card-hint">{p.useCaseHint}</p>
                  ) : null}

                  <p className="hz-vps-card-price">
                    {formatAmount(p.priceRetailMonthly, 'EUR')}
                    <span>/ay</span>
                  </p>

                  <dl className="hz-vps-metrics">
                    <div>
                      <Cpu size={15} aria-hidden />
                      <dt>vCPU</dt>
                      <dd>{p.cores ?? '—'}</dd>
                    </div>
                    <div>
                      <MemoryStick size={15} aria-hidden />
                      <dt>RAM</dt>
                      <dd>{memGb(p) != null ? `${memGb(p)} GB` : '—'}</dd>
                    </div>
                    <div>
                      <HardDrive size={15} aria-hidden />
                      <dt>Disk</dt>
                      <dd>{diskGb(p) != null ? `${diskGb(p)} GB` : '—'}</dd>
                    </div>
                    <div>
                      <Network size={15} aria-hidden />
                      <dt>Trafik</dt>
                      <dd>
                        {p.trafficTb != null ? `${p.trafficTb} TB` : '—'}
                      </dd>
                    </div>
                  </dl>

                  <button
                    type="button"
                    className="hz-btn-solid hz-vps-card-cta"
                    onClick={openConsole}
                  >
                    Console’da aç
                    <ArrowRight size={16} />
                  </button>
                </article>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <p className="hz-vps-empty">Bu ailede plan yok.</p>
          ) : (
            <div className="hz-vps-table-wrap">
              <table className="hz-vps-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>vCPU</th>
                    <th>RAM</th>
                    <th>Disk</th>
                    <th>Trafik</th>
                    <th>Fiyat</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr key={`row-${p.name}`}>
                      <td>
                        <strong>
                          {(p.description || p.name).toUpperCase()}
                        </strong>
                        {p.useCaseHint ? (
                          <span className="hz-muted-line">{p.useCaseHint}</span>
                        ) : null}
                      </td>
                      <td>{p.cores ?? '—'}</td>
                      <td>
                        {memGb(p) != null ? `${memGb(p)} GB` : '—'}
                      </td>
                      <td>
                        {diskGb(p) != null ? `${diskGb(p)} GB` : '—'}
                      </td>
                      <td>
                        {p.trafficTb != null ? `${p.trafficTb} TB` : '—'}
                      </td>
                      <td className="hz-td-price">
                        {formatAmount(p.priceRetailMonthly, 'EUR')}
                        <span>/ay</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="hz-vps-row-cta"
                          onClick={openConsole}
                        >
                          Console
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="hz-cta-band">
          <h2>Kendi cloud sunucunuzu panelden açın</h2>
          <p>
            VPS, web sepeti / kart (Polar) ödemesine dahil değildir. Console →
            Cloud üzerinden provision edin.
          </p>
          <div className="hz-vps-hero-actions" style={{ justifyContent: 'center' }}>
            <button type="button" className="hz-btn-solid" onClick={openConsole}>
              Console → Cloud
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      </main>
    </MarketingShell>
  )
}

export default CloudPage
