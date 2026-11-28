import React, { useCallback, useEffect, useState } from 'react'
import { Download, Loader2, Plus, QrCode, Trash2, Shield } from 'lucide-react'
import { Link } from 'react-router-dom'
import { apiService } from '../../services/api'
import { useCurrency } from '@graphcore/shared'
import {
  CloudEmptyState,
  CloudError,
  CloudLoading,
  CloudPageHeader,
  CloudSlideOver,
  CloudStatusPill,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudFieldClass,
  cloudPanelClass,
  cloudTableWrap,
  cloudTd,
  cloudTh,
  cloudThead,
  cloudTr,
} from './cloudUi'

const CloudVpnPage: React.FC = () => {
  const { formatCents, fxHint } = useCurrency()
  const [status, setStatus] = useState<any>(null)
  const [peers, setPeers] = useState<any[]>([])
  const [servers, setServers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [qr, setQr] = useState<{ name: string; dataUrl: string } | null>(null)
  const [form, setForm] = useState({ name: '', serverId: '' })
  const [billingNotice, setBillingNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [st, srv] = await Promise.all([
        apiService.cloudVpnStatus(),
        apiService.cloudListServers(),
      ])
      setStatus(st.data)
      setPeers(st.data?.peers || [])
      setServers(srv.data || [])
    } catch (e: any) {
      setError(e.message || 'VPN durumu alınamadı')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const enable = async () => {
    setEnabling(true)
    setError('')
    try {
      await apiService.cloudVpnEnable()
      await load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setEnabling(false)
    }
  }

  const createPeer = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setBillingNotice('')
    try {
      const res = await apiService.cloudVpnCreatePeer({
        name: form.name,
        serverId: form.serverId || undefined,
      })
      const cfg = (res as any).data?.config
      const delta = (res as any).data?.billingDelta
      if (delta?.warning) {
        setBillingNotice(delta.warning)
      } else if ((res as any).data?.billing?.label) {
        setBillingNotice(
          `Faturalandırma: ${(res as any).data.billing.label}`
        )
      }
      if (cfg?.qrDataUrl) {
        setQr({ name: cfg.name || form.name, dataUrl: cfg.qrDataUrl })
      }
      setShow(false)
      setForm({ name: '', serverId: '' })
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const downloadConf = async (peerId: string, filename?: string) => {
    try {
      const res = await apiService.cloudVpnPeerConfig(peerId)
      const text = (res as any).data?.config
      const name = (res as any).data?.filename || filename || 'wg.conf'
      if (!text) throw new Error('Config boş')
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e.message)
    }
  }

  const showQr = async (peerId: string, name: string) => {
    try {
      const res = await apiService.cloudVpnPeerConfig(peerId)
      const dataUrl = (res as any).data?.qrDataUrl
      if (!dataUrl) throw new Error('QR üretilemedi')
      setQr({ name, dataUrl })
    } catch (e: any) {
      setError(e.message)
    }
  }

  const revoke = async (peerId: string) => {
    if (!window.confirm('Bu peer iptal edilsin mi? Faturalandırılabilir kullanıcı sayısı düşer.'))
      return
    try {
      await apiService.cloudVpnRevokePeer(peerId)
      await load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const addon = status?.addon
  const billing = status?.billing
  const unitCents = billing?.unitPriceCents ?? addon?.priceCents ?? 599
  const seats = billing?.seats ?? peers.length
  const totalLabel =
    billing?.label ||
    `${seats} kullanıcı × ${formatCents(unitCents, 'eur')} = ${formatCents(seats * unitCents, 'eur')}/ay`
  const unitPriceLabel = `${formatCents(unitCents, 'eur')}/kullanıcı/ay`
  const enabled = Boolean(status?.enabled)
  const nextSeatCost = formatCents(unitCents, 'eur')

  if (loading) return <CloudLoading />

  return (
    <div className="space-y-4">
      <CloudPageHeader
        title="VPN / WireGuard"
        description={`Kullanıcı başına faturalandırma — her aktif peer bir kullanıcı.${fxHint ? ` ${fxHint}` : ''}`}
        onRefresh={load}
        actions={
          <>
            {!enabled && (
              <button
                type="button"
                className={cloudBtnPrimary}
                disabled={enabling}
                onClick={enable}
              >
                {enabling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                Ek hizmeti aç
              </button>
            )}
            <button
              type="button"
              className={cloudBtnPrimary}
              onClick={() => setShow(true)}
              disabled={!enabled && !status}
            >
              <Plus className="h-3.5 w-3.5" />
              Peer oluştur
            </button>
          </>
        }
      />

      {error && <CloudError message={error} />}
      {billingNotice && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          {billingNotice}
        </div>
      )}

      <div className={`${cloudPanelClass} p-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {addon?.name || 'WireGuard VPN'}
            </div>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              {addon?.description ||
                'VPN aç → peer indir → bağlan → sunucuya RDP/SSH. Her aktif peer bir kullanıcıdır.'}{' '}
              Birim fiyat:{' '}
              <strong className="text-slate-700 dark:text-slate-200">
                {unitPriceLabel}
              </strong>
              {addon?.billingNote ? ` · ${addon.billingNote}` : ''}
            </p>
            <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-100">
              Faturalandırılabilir:{' '}
              <span className="font-mono">{totalLabel}</span>
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {seats} faturalandırılabilir kullanıcı · quantity = {seats}
            </p>
            {status?.mock && (
              <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-300">
                VPN uç noktası yapılandırılmamış. Üretim için{' '}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                  WIREGUARD_ENDPOINT
                </code>{' '}
                +{' '}
                <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">
                  WIREGUARD_SERVER_PUBLIC_KEY
                </code>{' '}
                ayarlayın.
              </p>
            )}
          </div>
          <CloudStatusPill status={enabled ? 'active' : 'off'} />
        </div>
        {status?.network && (
          <dl className="mt-3 grid gap-2 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Subnet</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {status.network.subnetCidr}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Endpoint</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {status.network.serverEndpoint || '— (yapılandırılmamış)'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">DNS</dt>
              <dd className="font-mono text-slate-800 dark:text-slate-200">
                {status.network.dns || '1.1.1.1'}
              </dd>
            </div>
          </dl>
        )}
      </div>

      {!peers.length ? (
        <CloudEmptyState
          title="Henüz peer yok"
          description={`Ek hizmeti açıp bir peer oluşturun (+${nextSeatCost}/ay). .conf indirin veya QR tarayın.`}
        />
      ) : (
        <div className={cloudTableWrap}>
          <table className="w-full text-sm">
            <thead className={cloudThead}>
              <tr>
                <th className={cloudTh}>Ad</th>
                <th className={cloudTh}>Adres</th>
                <th className={cloudTh}>Sunucu</th>
                <th className={cloudTh}>Faturalandırma</th>
                <th className={cloudTh}>Durum</th>
                <th className={cloudTh}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {peers.map((p) => (
                <tr key={p.id} className={cloudTr}>
                  <td className={cloudTd}>{p.name}</td>
                  <td className={`${cloudTd} font-mono text-xs`}>{p.addressCidr}</td>
                  <td className={cloudTd}>
                    {p.serverId ? (
                      <Link
                        to={`/cloud/servers/${p.serverId}`}
                        className="text-blue-700 hover:underline dark:text-red-500"
                      >
                        {p.serverId.slice(0, 12)}…
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={cloudTd}>
                    <span className="text-xs text-slate-600 dark:text-slate-300">
                      1 kullanıcı · {formatCents(p.unitPriceCents ?? unitCents, 'eur')}
                      /ay
                    </span>
                  </td>
                  <td className={cloudTd}>
                    <CloudStatusPill status={p.status} />
                  </td>
                  <td className={`${cloudTd} space-x-1`}>
                    <button
                      type="button"
                      className={cloudBtnGhost}
                      title=".conf indir"
                      onClick={() => downloadConf(p.id, `${p.name}.conf`)}
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cloudBtnGhost}
                      title="QR göster"
                      onClick={() => showQr(p.id, p.name)}
                    >
                      <QrCode className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className={cloudBtnGhost}
                      title="İptal et"
                      onClick={() => revoke(p.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CloudSlideOver
        open={show}
        onClose={() => setShow(false)}
        title="Yeni WireGuard peer"
      >
        <form className="space-y-3" onSubmit={createPeer}>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Peer adı
            <input
              className={`${cloudFieldClass} mt-1`}
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="laptop-ferhat"
            />
          </label>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
            Sunucu (isteğe bağlı rota)
            <select
              className={`${cloudFieldClass} mt-1`}
              value={form.serverId}
              onChange={(e) => setForm((f) => ({ ...f, serverId: e.target.value }))}
            >
              <option value="">— Yok —</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.ipv4 ? ` (${s.ipv4})` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            <strong>Ek aylık maliyet:</strong> +{nextSeatCost}/ay (1 kullanıcı).
            Sonrası:{' '}
            <span className="font-mono">
              {seats + 1} kullanıcı × {formatCents(unitCents, 'eur')} ={' '}
              {formatCents((seats + 1) * unitCents, 'eur')}/ay
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Sunucu seçilirse AllowedIPs içine sunucu IP’si eklenir — VPN sonrası RDP/SSH için.
          </p>
          <button type="submit" className={cloudBtnPrimary} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Oluştur (+{nextSeatCost}/ay)
          </button>
        </form>
      </CloudSlideOver>

      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className={`${cloudPanelClass} max-w-sm p-5 text-center`}>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              QR — {qr.name}
            </h3>
            <img
              src={qr.dataUrl}
              alt="WireGuard QR"
              className="mx-auto mt-3 rounded bg-white p-2"
              width={280}
              height={280}
            />
            <p className="mt-2 text-[11px] text-slate-500">
              WireGuard mobil uygulamasında QR ile içe aktarın.
            </p>
            <button
              type="button"
              className={`${cloudBtnGhost} mt-3`}
              onClick={() => setQr(null)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default CloudVpnPage
