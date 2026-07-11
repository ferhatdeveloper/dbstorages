import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Link2, Link2Off, Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { apiService } from '../../services/api'

type Kind =
  | 'volumes'
  | 'snapshots'
  | 'firewalls'
  | 'ssh-keys'
  | 'networks'
  | 'operations'

const TITLES: Record<Kind, string> = {
  volumes: 'Volumes',
  snapshots: 'Snapshots',
  firewalls: 'Firewalls',
  'ssh-keys': 'SSH Keys',
  networks: 'Networks',
  operations: 'Activity / Jobs',
}

type Props = {
  kind: Kind
  createMode?: 'volume' | 'firewall' | 'snapshot' | 'ssh' | 'network' | null
  /** jobs = highlight pending/running; activity = all ops */
  opsFilter?: 'all' | 'active'
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  running: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  completed: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
}

const fieldClass =
  'rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950'

const CloudResourcePage: React.FC<Props> = ({
  kind,
  createMode = null,
  opsFilter = 'all',
}) => {
  const [rows, setRows] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [servers, setServers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [attachFor, setAttachFor] = useState<string | null>(null)
  const [restoreFor, setRestoreFor] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({
    providerId: '',
    name: '',
    sizeGb: '10',
    location: 'nbg1',
    serverId: '',
    publicKey: '',
    ipRange: '10.0.0.0/16',
    ruleDirection: 'in',
    ruleProtocol: 'tcp',
    rulePort: '22',
    ruleSource: '0.0.0.0/0',
    serverType: 'cx22',
  })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let data: any[] = []
      if (kind === 'volumes') data = (await apiService.cloudListVolumes()).data || []
      else if (kind === 'snapshots') data = (await apiService.cloudListSnapshots()).data || []
      else if (kind === 'firewalls') data = (await apiService.cloudListFirewalls()).data || []
      else if (kind === 'ssh-keys') data = (await apiService.cloudListSshKeys()).data || []
      else if (kind === 'networks') data = (await apiService.cloudListNetworks()).data || []
      else data = (await apiService.cloudListOperations()).data || []

      setRows(data)
      if (createMode || kind === 'volumes' || kind === 'snapshots') {
        const p = await apiService.cloudListProviders()
        setProviders(p.data || [])
        if (p.data?.[0]) setForm((f) => ({ ...f, providerId: f.providerId || p.data![0].id }))
        const s = await apiService.cloudListServers()
        setServers(s.data || [])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [kind, createMode])

  useEffect(() => {
    load()
  }, [load])

  const displayed = useMemo(() => {
    if (kind !== 'operations' || opsFilter !== 'active') return rows
    return rows.filter((r) =>
      ['pending', 'running'].includes(String(r.status || '').toLowerCase())
    )
  }, [rows, kind, opsFilter])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createMode) return
    setSaving(true)
    setError('')
    try {
      if (createMode === 'volume') {
        await apiService.cloudCreateVolume({
          providerId: form.providerId,
          name: form.name,
          sizeGb: Number(form.sizeGb) || 10,
          location: form.location,
          serverId: form.serverId || undefined,
        })
      } else if (createMode === 'firewall') {
        const rules = [
          {
            direction: form.ruleDirection || 'in',
            protocol: form.ruleProtocol || 'tcp',
            port: form.rulePort || undefined,
            source_ips:
              form.ruleDirection === 'in'
                ? [form.ruleSource || '0.0.0.0/0']
                : undefined,
            destination_ips:
              form.ruleDirection === 'out'
                ? [form.ruleSource || '0.0.0.0/0']
                : undefined,
          },
        ]
        await apiService.cloudCreateFirewall({
          providerId: form.providerId,
          name: form.name,
          rules,
        })
      } else if (createMode === 'snapshot') {
        await apiService.cloudCreateSnapshot({
          serverId: form.serverId,
          name: form.name,
        })
      } else if (createMode === 'ssh') {
        await apiService.cloudCreateSshKey({
          providerId: form.providerId,
          name: form.name,
          publicKey: form.publicKey,
        })
      } else if (createMode === 'network') {
        await apiService.cloudCreateNetwork({
          providerId: form.providerId,
          name: form.name,
          ipRange: form.ipRange,
        })
      }
      setShow(false)
      setForm((f) => ({ ...f, name: '', publicKey: '' }))
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const attach = async (volumeId: string) => {
    if (!form.serverId) {
      setError('Attach için sunucu seçin')
      return
    }
    try {
      await apiService.cloudAttachVolume(volumeId, form.serverId)
      setAttachFor(null)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const detach = async (volumeId: string) => {
    try {
      await apiService.cloudDetachVolume(volumeId)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const removeRow = async (id: string) => {
    if (!window.confirm('Silinsin mi?')) return
    try {
      if (kind === 'volumes') await apiService.cloudDeleteVolume(id)
      else if (kind === 'snapshots') await apiService.cloudDeleteSnapshot(id)
      else if (kind === 'firewalls') await apiService.cloudDeleteFirewall(id)
      else if (kind === 'ssh-keys') await apiService.cloudDeleteSshKey(id)
      else if (kind === 'networks') await apiService.cloudDeleteNetwork(id)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const resizeVol = async (id: string, current: number) => {
    const next = window.prompt('Yeni boyut (GB)', String((current || 10) + 10))
    if (!next) return
    try {
      await apiService.cloudResizeVolume(id, Number(next))
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const restore = async (snapshotId: string) => {
    setSaving(true)
    setError('')
    try {
      await apiService.cloudRestoreSnapshot(snapshotId, {
        name: form.name || `restore-${Date.now()}`,
        serverType: form.serverType || 'cx22',
        location: form.location || 'nbg1',
      })
      setRestoreFor(null)
      setForm((f) => ({ ...f, name: '' }))
      await load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const rulesSummary = (r: any) => {
    const rules = r.rules || r.metadata?.rules || []
    if (!Array.isArray(rules) || !rules.length) return '—'
    return rules
      .slice(0, 3)
      .map(
        (rule: any) =>
          `${rule.direction || '?'}/${rule.protocol || '?'}:${rule.port || '*'}`
      )
      .join(', ')
  }

  const emptyHint =
    kind === 'networks'
      ? 'Ağ yok. Provider destekliyorsa Yeni ile private network oluşturun; aksi halde boş kalır.'
      : kind === 'operations'
        ? opsFilter === 'active'
          ? 'Aktif provisioning job yok.'
          : 'Henüz işlem kaydı yok.'
        : 'Kayıt yok — Yeni ile oluşturun.'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {opsFilter === 'active' ? 'Provisioning Jobs' : TITLES[kind]}
          </h2>
          {kind === 'operations' && (
            <p className="mt-0.5 text-xs text-slate-500">
              {opsFilter === 'active'
                ? 'pending / running işlemler'
                : 'Tüm cloud operasyonları (pending → completed / failed)'}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-lg border px-2 py-1 text-xs dark:border-slate-700">
            <RefreshCw className="inline h-3.5 w-3.5" />
          </button>
          {createMode && (
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs text-white dark:bg-lime-500 dark:text-slate-900"
            >
              <Plus className="h-3.5 w-3.5" /> Yeni
            </button>
          )}
        </div>
      </div>

      {show && createMode && (
        <form onSubmit={create} className="grid max-w-lg gap-2 rounded-xl border p-4 dark:border-slate-700">
          {createMode !== 'snapshot' && (
            <label className="grid gap-1 text-xs text-slate-500">
              Provider
              <select
                className={fieldClass}
                value={form.providerId}
                onChange={(e) => setForm({ ...form, providerId: e.target.value })}
                required
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="grid gap-1 text-xs text-slate-500">
            Ad
            <input
              className={fieldClass}
              placeholder="Ad"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required={createMode !== 'snapshot'}
            />
          </label>
          {createMode === 'volume' && (
            <>
              <label className="grid gap-1 text-xs text-slate-500">
                Boyut (GB)
                <input
                  className={fieldClass}
                  value={form.sizeGb}
                  onChange={(e) => setForm({ ...form, sizeGb: e.target.value })}
                  placeholder="10"
                />
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                Location
                <input
                  className={fieldClass}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                />
              </label>
            </>
          )}
          {(createMode === 'snapshot' || createMode === 'volume') && (
            <label className="grid gap-1 text-xs text-slate-500">
              Sunucu {createMode === 'volume' ? '(attach, opsiyonel)' : ''}
              <select
                className={fieldClass}
                value={form.serverId}
                onChange={(e) => setForm({ ...form, serverId: e.target.value })}
                required={createMode === 'snapshot'}
              >
                <option value="">Seçin</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {createMode === 'firewall' && (
            <fieldset className="grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
              <legend className="px-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                Kural (özet)
              </legend>
              <div className="grid grid-cols-2 gap-2">
                <select
                  className={fieldClass}
                  value={form.ruleDirection}
                  onChange={(e) => setForm({ ...form, ruleDirection: e.target.value })}
                >
                  <option value="in">in</option>
                  <option value="out">out</option>
                </select>
                <select
                  className={fieldClass}
                  value={form.ruleProtocol}
                  onChange={(e) => setForm({ ...form, ruleProtocol: e.target.value })}
                >
                  <option value="tcp">tcp</option>
                  <option value="udp">udp</option>
                  <option value="icmp">icmp</option>
                </select>
                <input
                  className={fieldClass}
                  placeholder="Port (22)"
                  value={form.rulePort}
                  onChange={(e) => setForm({ ...form, rulePort: e.target.value })}
                />
                <input
                  className={fieldClass}
                  placeholder="CIDR 0.0.0.0/0"
                  value={form.ruleSource}
                  onChange={(e) => setForm({ ...form, ruleSource: e.target.value })}
                />
              </div>
            </fieldset>
          )}
          {createMode === 'ssh' && (
            <label className="grid gap-1 text-xs text-slate-500">
              Public key
              <textarea
                className={`${fieldClass} font-mono text-xs`}
                rows={3}
                placeholder="ssh-ed25519 AAAA..."
                value={form.publicKey}
                onChange={(e) => setForm({ ...form, publicKey: e.target.value })}
                required
              />
            </label>
          )}
          {createMode === 'network' && (
            <label className="grid gap-1 text-xs text-slate-500">
              IP range
              <input
                className={fieldClass}
                value={form.ipRange}
                onChange={(e) => setForm({ ...form, ipRange: e.target.value })}
              />
            </label>
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-teal-700 py-2 text-sm text-white dark:bg-lime-500 dark:text-slate-900"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Oluştur'}
          </button>
        </form>
      )}

      {attachFor && (
        <div className="flex max-w-lg flex-wrap items-end gap-2 rounded-xl border p-3 dark:border-slate-700">
          <label className="grid flex-1 gap-1 text-xs text-slate-500">
            Attach sunucu
            <select
              className={fieldClass}
              value={form.serverId}
              onChange={(e) => setForm({ ...form, serverId: e.target.value })}
            >
              <option value="">Seçin</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => attach(attachFor)}
            className="rounded-lg bg-teal-700 px-3 py-2 text-xs text-white dark:bg-lime-500 dark:text-slate-900"
          >
            Attach
          </button>
          <button type="button" onClick={() => setAttachFor(null)} className="text-xs text-slate-500">
            İptal
          </button>
        </div>
      )}

      {restoreFor && (
        <div className="grid max-w-lg gap-2 rounded-xl border p-3 dark:border-slate-700">
          <p className="text-xs text-slate-500">Snapshot’tan yeni sunucu (async)</p>
          <input
            className={fieldClass}
            placeholder="Yeni sunucu adı"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              className={fieldClass}
              placeholder="Size (cx22)"
              value={form.serverType}
              onChange={(e) => setForm({ ...form, serverType: e.target.value })}
            />
            <input
              className={fieldClass}
              placeholder="Region"
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => restore(restoreFor)}
              className="rounded-lg bg-teal-700 px-3 py-2 text-xs text-white dark:bg-lime-500 dark:text-slate-900"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Restore'}
            </button>
            <button type="button" onClick={() => setRestoreFor(null)} className="text-xs text-slate-500">
              İptal
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              {kind === 'operations' ? (
                <tr>
                  <th className="px-3 py-2">İşlem</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Kaynak</th>
                  <th className="px-3 py-2">Hata</th>
                  <th className="px-3 py-2">Zaman</th>
                </tr>
              ) : kind === 'volumes' ? (
                <tr>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">GB</th>
                  <th className="px-3 py-2">Sunucu</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              ) : kind === 'snapshots' ? (
                <tr>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Sunucu</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              ) : kind === 'firewalls' ? (
                <tr>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Kurallar</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              ) : kind === 'ssh-keys' ? (
                <tr>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">Fingerprint</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-3 py-2">Ad</th>
                  <th className="px-3 py-2">Durum</th>
                  <th className="px-3 py-2">IP Range</th>
                  <th className="px-3 py-2">İşlem</th>
                </tr>
              )}
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {displayed.map((r) => {
                if (kind === 'operations') {
                  const st = String(r.status || '').toLowerCase()
                  return (
                    <tr key={r.id} className="border-t dark:border-slate-800">
                      <td className="px-3 py-2 font-mono text-xs">{r.action}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            STATUS_BADGE[st] || 'bg-slate-100 dark:bg-slate-800'
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.resource_type}/{r.resource_id?.slice?.(0, 8) || '—'}
                      </td>
                      <td className="max-w-[14rem] truncate px-3 py-2 text-xs text-red-600">
                        {r.error || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
                        {r.created_at ? new Date(r.created_at).toLocaleString('tr-TR') : '—'}
                      </td>
                    </tr>
                  )
                }
                if (kind === 'volumes') {
                  return (
                    <tr key={r.id} className="border-t dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{r.status}</td>
                      <td className="px-3 py-2 text-xs">{r.size_gb ?? r.sizeGb ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.server_id || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Attach"
                            onClick={() => setAttachFor(r.id)}
                            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Link2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Detach"
                            onClick={() => detach(r.id)}
                            className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <Link2Off className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            title="Resize"
                            onClick={() => resizeVol(r.id, r.size_gb || r.sizeGb || 10)}
                            className="rounded px-1 text-[10px] hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            Resize
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            onClick={() => removeRow(r.id)}
                            className="rounded p-1 text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                if (kind === 'snapshots') {
                  return (
                    <tr key={r.id} className="border-t dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{r.status}</td>
                      <td className="px-3 py-2 font-mono text-xs">{r.server_id || '—'}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            title="Restore"
                            onClick={() => {
                              setRestoreFor(r.id)
                              setForm((f) => ({ ...f, name: `${r.name || 'snap'}-restore` }))
                            }}
                            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Restore
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            className="rounded p-1 text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                if (kind === 'firewalls') {
                  return (
                    <tr key={r.id} className="border-t dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{r.status}</td>
                      <td className="px-3 py-2 font-mono text-xs">{rulesSummary(r)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border px-2 py-0.5 text-[10px] dark:border-slate-700"
                            onClick={async () => {
                              if (!form.serverId && servers[0]) {
                                setForm((f) => ({ ...f, serverId: servers[0].id }))
                              }
                              const sid = form.serverId || servers[0]?.id
                              if (!sid) {
                                setError('Önce sunucu oluşturun')
                                return
                              }
                              try {
                                await apiService.cloudApplyFirewall(r.id, [sid])
                                await load()
                              } catch (err: any) {
                                setError(err.message)
                              }
                            }}
                          >
                            Apply
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(r.id)}
                            className="rounded p-1 text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                }
                if (kind === 'ssh-keys') {
                  return (
                    <tr key={r.id} className="border-t dark:border-slate-800">
                      <td className="px-3 py-2 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-xs">{r.status || '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {r.fingerprint || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="rounded p-1 text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                }
                return (
                  <tr key={r.id} className="border-t dark:border-slate-800">
                    <td className="px-3 py-2 font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-xs">{r.status}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.ip_range || r.ipRange || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-[10px] dark:border-slate-700"
                          onClick={async () => {
                            const range = window.prompt('Subnet CIDR', '10.0.1.0/24')
                            if (!range) return
                            try {
                              await apiService.cloudNetworkAction(r.id, 'add-subnet', {
                                subnet: { ipRange: range, networkZone: 'eu-central' },
                              })
                              await load()
                            } catch (err: any) {
                              setError(err.message)
                            }
                          }}
                        >
                          +Subnet
                        </button>
                        <button
                          type="button"
                          className="rounded border px-2 py-0.5 text-[10px] dark:border-slate-700"
                          onClick={async () => {
                            const sid = form.serverId || servers[0]?.id
                            if (!sid) {
                              setError('Sunucu seçin/oluşturun')
                              return
                            }
                            try {
                              await apiService.cloudNetworkAction(r.id, 'attach', {
                                serverId: sid,
                              })
                              await load()
                            } catch (err: any) {
                              setError(err.message)
                            }
                          }}
                        >
                          Attach srv
                        </button>
                        <button
                          type="button"
                          onClick={() => removeRow(r.id)}
                          className="rounded p-1 text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
              {!displayed.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    {emptyHint}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export const CloudVolumesPage = () => <CloudResourcePage kind="volumes" createMode="volume" />
export const CloudSnapshotsPage = () => (
  <CloudResourcePage kind="snapshots" createMode="snapshot" />
)
export const CloudFirewallsPage = () => (
  <CloudResourcePage kind="firewalls" createMode="firewall" />
)
export const CloudSshKeysPage = () => <CloudResourcePage kind="ssh-keys" createMode="ssh" />
export const CloudNetworksPage = () => <CloudResourcePage kind="networks" createMode="network" />
export const CloudActivityPage = () => (
  <CloudResourcePage kind="operations" opsFilter="all" />
)
export const CloudJobsPage = () => (
  <CloudResourcePage kind="operations" opsFilter="active" />
)

export default CloudResourcePage
