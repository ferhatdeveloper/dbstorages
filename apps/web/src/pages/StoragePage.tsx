import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight } from 'lucide-react'
import MarketingShell from '../components/MarketingShell'
import { cartPath } from '../lib/cartPlans'

const FEATURES = [
  {
    title: 'Object storage',
    body: 'Dosya, yedek ve medya için S3 uyumlu alan. Database planlarına dahil GB kotası veya bağımsız volume.',
  },
  {
    title: 'Volume & disk',
    body: 'Cloud sunucuya bağlanan kalıcı diskler. Büyütün, snapshot alın, aynı panelden yönetin.',
  },
  {
    title: 'Yedekleme',
    body: 'Opsiyonel yedekleme eklentisi — planlardan bağımsız, saklama süresine göre faturalanır.',
  },
]

const StoragePage: React.FC = () => {
  return (
    <MarketingShell active="storage">
      <div className="hz-page-band">
        <div className="hz-page-band-inner">
          <span className="hz-pill">Storage</span>
          <h1>Object storage ve volume</h1>
          <p>
            Verileriniz için güvenilir alan — sunucu volume’leri, object storage
            ve yedekleme aynı ekosistemde.
          </p>
        </div>
        <div className="hz-hero-cut" aria-hidden />
      </div>

      <main>
        <section className="hz-section">
          <h2 className="hz-section-title">Ne için kullanırsınız?</h2>
          <p className="hz-section-lead">
            Network, firewall, volume ve API ile birlikte — panelden saniyeler
            içinde açın.
          </p>

          <div className="hz-ops-grid" style={{ marginTop: '2rem' }}>
            {FEATURES.map((f) => (
              <div key={f.title}>
                <h3>
                  <Check size={16} style={{ display: 'inline', marginRight: 6 }} />
                  {f.title}
                </h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="hz-dual-band">
          <div className="hz-dual-inner">
            <article>
              <h2>Cloud sunucu + volume</h2>
              <p>
                Region, image, volume, firewall ve SSH key ile VPS provision.
                Diski sunucuya bağlayın veya büyütün.
              </p>
              <Link to="/cloud" className="hz-link-arrow">
                Sunucu planları
                <ChevronRight size={16} />
              </Link>
            </article>
            <article>
              <h2>Database + object storage</h2>
              <p>
                Yönetilen Database paketlerinde dahil GB; Pro ve üzeri planlarda
                object storage kotası.
              </p>
              <Link to="/database" className="hz-link-arrow">
                Database paketleri
                <ChevronRight size={16} />
              </Link>
            </article>
          </div>
        </section>

        <section className="hz-cta-band">
          <h2>Depolamayı panele bağlayın</h2>
          <p>
            Kayıt olun; Cloud ve Database panellerinden volume ile storage’ı
            yönetin.
          </p>
          <Link to={cartPath({ plan: 'pro', interval: 'month' })} className="hz-btn-solid">
            Paketi sepete ekle
            <ArrowRight size={18} />
          </Link>
        </section>
      </main>
    </MarketingShell>
  )
}

export default StoragePage
