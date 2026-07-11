import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { apiService } from '../../services/api'

/** Generic list+create page for volumes / snapshots / firewalls / ssh / networks / ops */
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

type Props = { kind: Kind; createMode?: 'volume' | 'firewall' | 'snapshot' | 'ssh' | 'network' | null }

const CloudResourcePage: React.FC<Props> = ({ kind, createMode = null }) => {
  const [rows, setRows] = useState<any[]>([])
  const [providers, setProviders] = useState<any[]>([])
  const [servers, setServers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({
    providerId: '',
    name: '',
    sizeGb: '10',
    location: 'nbg1',
    serverId: '',
    publicKey: '',
    ipRange: '10.0.0.0/16',
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
      if (createMode) {
        const p = await apiService.cloudListProviders()
        setProviders(p.data || [])
        if (p.data?.[0]) setForm((f) => ({ ...f, providerId: f.providerId || p.data![0].id }))
        if (createMode === 'snapshot' || createMode === 'volume') {
          const s = await apiService.cloudListServers()
          setServers(s.data || [])
        }
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
        await apiService.cloudCreateFirewall({
          providerId: form.providerId,
          name: form.name,
          rules: [],
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

  const cols =
    kind === 'operations'
      ? ['action', 'status', 'resource_type', 'error', 'created_at']
      : ['name', 'status', 'id']

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{TITLES[kind]}</h2>
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
            <select
              className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
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
          )}
          <input
            className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            placeholder="Ad"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required={createMode !== 'snapshot'}
          />
          {createMode === 'volume' && (
            <>
              <input
                className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={form.sizeGb}
                onChange={(e) => setForm({ ...form, sizeGb: e.target.value })}
                placeholder="GB"
              />
              <input
                className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </>
          )}
          {(createMode === 'snapshot' || createMode === 'volume') && (
            <select
              className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={form.serverId}
              onChange={(e) => setForm({ ...form, serverId: e.target.value })}
              required={createMode === 'snapshot'}
            >
              <option value="">Sunucu {createMode === 'volume' ? '(opsiyonel)' : ''}</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {createMode === 'ssh' && (
            <textarea
              className="rounded-lg border px-3 py-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
              rows={3}
              placeholder="ssh-ed25519 AAAA..."
              value={form.publicKey}
              onChange={(e) => setForm({ ...form, publicKey: e.target.value })}
              required
            />
          )}
          {createMode === 'network' && (
            <input
              className="rounded-lg border px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              value={form.ipRange}
              onChange={(e) => setForm({ ...form, ipRange: e.target.value })}
            />
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-x-auto rounded-xl border dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="px-3 py-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {rows.map((r) => (
                <tr key={r.id} className="border-t dark:border-slate-800">
                  {cols.map((c) => (
                    <td key={c} className="max-w-xs truncate px-3 py-2 font-mono text-xs">
                      {String(r[c] ?? r.name ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={cols.length} className="px-3 py-8 text-center text-slate-400">
                    Kayıt yok
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
export const CloudSnapshotsPage = () => <CloudResourcePage kind="snapshots" createMode="snapshot" />
export const CloudFirewallsPage = () => <CloudResourcePage kind="firewalls" createMode="firewall" />
export const CloudSshKeysPage = () => <CloudResourcePage kind="ssh-keys" createMode="ssh" />
export const CloudNetworksPage = () => <CloudResourcePage kind="networks" createMode="network" />
export const CloudActivityPage = () => <CloudResourcePage kind="operations" />
export const CloudJobsPage = () => <CloudResourcePage kind="operations" />

export default CloudResourcePage
