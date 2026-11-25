import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  Monitor,
  Power,
  PowerOff,
  RotateCcw,
  Shield,
  Terminal,
} from 'lucide-react'
import { apiService } from '../../services/api'
import { useCurrency } from '@graphcore/shared'
import {
  CloudError,
  CloudLoading,
  CloudPageHeader,
  CloudStatusPill,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudPanelClass,
} from './cloudUi'

type ChecklistItem = {
  id: string
  label: string
  hint: string
  done?: boolean
}

function isWindowsServer(server: any) {
  const meta = server?.metadata || {}
  const labels = server?.labels || {}
  const blob = `${server?.image || ''} ${meta.osFamily || ''} ${labels.os_family || ''}`.toLowerCase()
  return blob.includes('windows')
}

const CloudServerDetailPage: React.FC = () => {
  const { formatAmount } = useCurrency()
  const { id = '' } = useParams()
  const [server, setServer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [consoleBusy, setConsoleBusy] = useState(false)
  const [consoleInfo, setConsoleInfo] = useState<{
    wssUrl?: string | null
    password?: string | null
  } | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const res = await apiService.cloudGetServer(id)
      setServer(res.data)
      const c = res.data?.metadata?.console
      if (c?.wssUrl) {
        setConsoleInfo({ wssUrl: c.wssUrl, password: c.password || null })
      }
    } catch (e: any) {
      setError(e.message || 'Sunucu yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!id || !server) return
    const st = String(server.status || '').toLowerCase()
    if (['running', 'active', 'online'].includes(st) && (server.ipv4 || server.ipv6)) return
    const t = window.setInterval(() => {
      load()
    }, 3000)
    return () => window.clearInterval(t)
  }, [id, server?.status, server?.ipv4, load]) // eslint-disable-line react-hooks/exhaustive-deps

  const windows = isWindowsServer(server)
  const running = ['running', 'active', 'online'].includes(
    String(server?.status || '').toLowerCase()
  )

  const checklist: ChecklistItem[] = useMemo(() => {
    if (!server) return []
    const items: ChecklistItem[] = [
      {
        id: 'power',
        label: 'Güç durumunu doğrula',
        hint: running
          ? 'Sunucu çalışıyor.'
          : 'Power on ile başlatın; durum running olmalı.',
        done: running,
      },
      {
        id: 'console',
        label: 'Konsol / VNC erişimini test et',
        hint: 'Aşağıdaki Konsol panelinden web konsol isteyin veya WSS URL’yi kullanın.',
        done: Boolean(consoleInfo?.wssUrl || server.metadata?.console?.wssUrl),
      },
    ]
    if (windows) {
      items.push(
        {
          id: 'vpn-first',
          label: 'VPN ile bağlan (önerilir)',
          hint: 'Cloud → VPN / WireGuard: peer oluştur → .conf veya QR → WireGuard’a bağlan; ardından RDP’yi VPN üzerinden açın.',
          done: checked['vpn-first'],
        },
        {
          id: 'rdp-fw',
          label: 'Firewall: RDP TCP 3389',
          hint: 'Mümkünse RDP’yi yalnızca VPN subnet’ine (ör. 10.66.0.0/24) açın; aksi halde inbound TCP 3389.',
          done: checked['rdp-fw'],
        },
        {
          id: 'password',
          label: 'Administrator parolasını kaydet',
          hint: 'Parola yalnızca oluşturma / rebuild işleminde bir kez döner (Activity sonucu). Kaybetmeyin.',
          done: checked['password'] || Boolean(server.metadata?.rootPasswordSet),
        },
        {
          id: 'rdp-connect',
          label: 'RDP ile bağlan',
          hint: server.ipv4
            ? `VPN açıkken mstsc → ${server.ipv4}:3389 (veya VPN rota IP’si). Kullanıcı: Administrator.`
            : 'IP hazır olunca VPN sonrası RDP ile bağlanın.',
          done: checked['rdp-connect'],
        },
        {
          id: 'rescue',
          label: 'Rescue / parola sıfırlama notu',
          hint: 'Parola unutulursa Enable rescue + konsol; gerekirse rebuild. Advanced menüden erişilir.',
          done: checked['rescue'],
        }
      )
    } else {
      items.push(
        {
          id: 'vpn-first',
          label: 'VPN ile bağlan (önerilir)',
          hint: 'Cloud → VPN / WireGuard peer → bağlan; SSH’i özel ağ üzerinden kullanın.',
          done: checked['vpn-first'],
        },
        {
          id: 'ssh',
          label: 'SSH erişimini doğrula',
          hint: server.ipv4
            ? `ssh root@${server.ipv4} (veya seçtiğiniz kullanıcı).`
            : 'IP hazır olunca SSH deneyin.',
          done: checked['ssh'],
        },
        {
          id: 'fw-ssh',
          label: 'Firewall: SSH TCP 22',
          hint: 'Gerekirse Firewalls’ta 22/tcp kuralı ekleyin (tercihen VPN subnet).',
          done: checked['fw-ssh'],
        }
      )
    }
    return items
  }, [server, windows, running, consoleInfo, checked])

  const act = async (action: 'reboot' | 'power-on' | 'power-off') => {
    if (!id) return
    try {
      if (action === 'reboot') await apiService.cloudRebootServer(id)
      else if (action === 'power-on') await apiService.cloudPowerOnServer(id)
      else await apiService.cloudPowerOffServer(id)
      await load()
    } catch (e: any) {
      setError(e.message)
    }
  }

  const requestConsole = async () => {
    if (!id) return
    setConsoleBusy(true)
    setError('')
    try {
      const res = await apiService.cloudServerAction(id, 'request_console', {})
      const opId = (res as any).operationId || (res as any).data?.operation?.id
      if (opId) {
        for (let i = 0; i < 15; i++) {
          await new Promise((r) => setTimeout(r, 800))
          const op = await apiService.cloudGetOperation(String(opId))
          const row = (op as any).data
          const status = String(row?.status || '').toLowerCase()
          const result = row?.result || {}
          if (result.wssUrl) {
            setConsoleInfo({
              wssUrl: result.wssUrl,
              password: result.password || null,
            })
            break
          }
          if (status === 'failed' || status === 'error') {
            throw new Error(row?.error || 'Konsol isteği başarısız')
          }
          if (status === 'succeeded' || status === 'success' || status === 'completed') {
            break
          }
        }
      }
      await load()
    } catch (e: any) {
      setError(e.message || 'Konsol açılamadı')
    } finally {
      setConsoleBusy(false)
    }
  }

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      /* ignore */
    }
  }

  if (loading && !server) return <CloudLoading />
  if (!server) {
    return (
      <div className="space-y-3">
        <CloudError message={error || 'Sunucu bulunamadı'} />
        <Link to="/cloud/servers" className={cloudBtnGhost}>
          <ArrowLeft className="h-3.5 w-3.5" /> Sunucular
        </Link>
      </div>
    )
  }

  const wss = consoleInfo?.wssUrl || server.metadata?.console?.wssUrl
  const consolePw = consoleInfo?.password || server.metadata?.console?.password

  return (
    <div className="space-y-4">
      <CloudPageHeader
        title={server.name}
        description={`${server.server_type || '—'} · ${server.image || '—'} · ${server.location || '—'}`}
        onRefresh={load}
        refreshing={loading}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/cloud/servers" className={cloudBtnGhost}>
              <ArrowLeft className="h-3.5 w-3.5" /> Liste
            </Link>
            <button type="button" className={cloudBtnGhost} onClick={() => act('reboot')}>
              <RotateCcw className="h-3.5 w-3.5" /> Reboot
            </button>
            <button type="button" className={cloudBtnGhost} onClick={() => act('power-on')}>
              <Power className="h-3.5 w-3.5" /> Aç
            </button>
            <button type="button" className={cloudBtnGhost} onClick={() => act('power-off')}>
              <PowerOff className="h-3.5 w-3.5" /> Kapat
            </button>
          </div>
        }
      />

      <CloudError message={error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <div className={`${cloudPanelClass} p-4`}>
            <div className="flex flex-wrap items-center gap-3">
              <CloudStatusPill status={server.status} />
              {windows ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-800 dark:bg-sky-950 dark:text-sky-300">
                  <Monitor className="h-3 w-3" /> Windows Server
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <Terminal className="h-3 w-3" /> Linux
                </span>
              )}
            </div>
            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-slate-400">IPv4</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-100">
                  {server.ipv4 || '— (bekleniyor)'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">IPv6</dt>
                <dd className="font-mono text-slate-800 dark:text-slate-100">
                  {server.ipv6 || '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Perakende</dt>
                <dd>
                  {server.price_retail != null
                    ? `${formatAmount(
                        Number(server.price_retail),
                        String((server as any).currency || 'EUR').toUpperCase()
                      )}/ay`
                    : '—'}
                  {(server.metadata as any)?.priceYearlyUsd != null && (
                    <span className="mt-0.5 block text-[10px] text-slate-400">
                      ${(server.metadata as any).priceYearlyUsd}/yıl
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">External ID</dt>
                <dd className="font-mono">{server.external_id || '—'}</dd>
              </div>
              {(server.metadata as any)?.cores != null && (
                <>
                  <div>
                    <dt className="text-slate-400">Kaynaklar</dt>
                    <dd>
                      {(server.metadata as any).cores} vCPU ·{' '}
                      {(server.metadata as any).memoryGb} GB RAM ·{' '}
                      {(server.metadata as any).diskGb} GB{' '}
                      {String((server.metadata as any).diskType || 'NVMe').toUpperCase()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">Ağ / Yedek</dt>
                    <dd>
                      {(server.metadata as any).bandwidthTb} TB bant genişliği
                      {(server.metadata as any).weeklyBackups
                        ? ' · Ücretsiz haftalık yedek'
                        : ''}
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {Array.isArray((server.metadata as any)?.features) &&
              (server.metadata as any).features.length > 0 && (
                <ul className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-300">
                  {((server.metadata as any).features as string[]).map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              )}
          </div>

          <div className={`${cloudPanelClass} p-4`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3
                  className="text-sm font-semibold text-slate-900 dark:text-slate-100"
                  style={{ fontFamily: 'Montserrat, Inter, sans-serif' }}
                >
                  Konsol paneli
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Hetzner web konsol (WSS). Yerleşik noVNC yoksa URL + parola ile sağlayıcı
                  konsoluna bağlanın.
                  {windows ? ' Windows için ayrıca RDP kullanın.' : ''}
                </p>
              </div>
              <button
                type="button"
                className={cloudBtnPrimary}
                disabled={consoleBusy}
                onClick={requestConsole}
              >
                {consoleBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Monitor className="h-3.5 w-3.5" />
                )}
                Konsol iste
              </button>
            </div>

            <div className="mt-4 space-y-2 rounded-md border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
              {wss ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        WSS URL
                      </p>
                      <p className="mt-1 break-all font-mono text-[11px] text-slate-700 dark:text-slate-200">
                        {wss}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={cloudBtnGhost}
                      onClick={() => copyText(String(wss), 'wss')}
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied === 'wss' ? 'Kopyalandı' : 'Kopyala'}
                    </button>
                  </div>
                  {consolePw && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                        Konsol parolası
                      </p>
                      <p className="mt-1 font-mono text-[11px]">{consolePw}</p>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Sağlayıcı panosunda «Console» veya noVNC istemcisi ile bu WSS adresini
                    kullanın. Activity kaydında da işlem sonucu görünür.
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">
                  Henüz konsol URL’si yok. «Konsol iste» ile WSS adresi alın; sunucu running
                  olmalıdır.
                </p>
              )}

              {windows && server.ipv4 && (
                <div className="mt-2 border-t border-slate-200 pt-2 dark:border-slate-800">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    RDP (Windows)
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-slate-700 dark:text-slate-200">
                    {server.ipv4}:3389 · kullanıcı: Administrator
                  </p>
                  <a
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 dark:text-red-500"
                    href={`https://console.hetzner.cloud/`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Hetzner web konsol <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className={`${cloudPanelClass} p-4`}>
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-700 dark:text-red-500" />
            <h3
              className="text-sm font-semibold text-slate-900 dark:text-slate-100"
              style={{ fontFamily: 'Montserrat, Inter, sans-serif' }}
            >
              Kurulum sonrası kontrol listesi
            </h3>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            Yeni sunucu için önerilen adımlar
            {windows ? ' (Windows Server).' : '.'}
          </p>
          <ul className="mt-4 space-y-3">
            {checklist.map((item) => {
              const done = Boolean(item.done)
              return (
                <li key={item.id} className="flex gap-2 text-xs">
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 text-blue-700 dark:text-red-500"
                    onClick={() =>
                      setChecked((c) => ({ ...c, [item.id]: !c[item.id] }))
                    }
                    title="İşaretle"
                  >
                    {done ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4 text-slate-300" />
                    )}
                  </button>
                  <div>
                    <p
                      className={`font-medium ${
                        done
                          ? 'text-slate-400 line-through'
                          : 'text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      {item.label}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
                      {item.hint}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
          <Link
            to="/cloud/firewalls"
            className={`${cloudBtnGhost} mt-4 w-full`}
          >
            Firewalls’a git
          </Link>
        </aside>
      </div>
    </div>
  )
}

export default CloudServerDetailPage
