import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, Power, PowerOff, RefreshCw, RotateCcw, Trash2 } from 'lucide-react'
import { apiService } from '../../services/api'

type Server = {
  id: string
  name: string
  status: string
  server_type?: string
  image?: string
  location?: string
  ipv4?: string
  ipv6?: string
  provider_id?: string
}

type Provider = { id: string; name: string; slug: string }
type SshKey = { id: string; name: string; external_id?: string }

const CloudServersPage: React.FC = () => {
  const [rows, setRows] = useState<Server[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [sshKeys, setSshKeys] = useState<SshKey[]>([])
  const [images, setImages] = useState<{ id: string; name?: string }[]>([])
  const [regions, setRegions] = useState<{ id: string; name?: string }[]>([])
  const [sizes, setSizes] = useState<{ id: string; name?: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    providerId: '',
    name: '',
    serverType: 'cx22',
    image: 'ubuntu-22.04',
    location: 'nbg1',
    sshKeyId: '',
    userData: '',
  })
  const [saving, setSaving] = useState(false)

  const loadCatalog = useCallback(async (providerId: string) => {
    if (!providerId) return
    try {
      const [img, reg, typ] = await Promise.all([
        apiService.cloudCatalog('images', providerId).catch(() => ({ data: [] })),
        apiService.cloudCatalog('regions', providerId).catch(() => ({ data: [] })),
        apiService.cloudCatalog('server-types', providerId).catch(() => ({ data: [] })),
      ])
      setImages(img.data || [])
      setRegions(reg.data || [])
      setSizes(typ.data || [])
      setForm((f) => ({
        ...f,
        image: String(img.data?.[0]?.name || img.data?.[0]?.id || f.image),
        location: String(reg.data?.[0]?.name || reg.data?.[0]?.id || f.location),
        serverType: String(typ.data?.[0]?.name || typ.data?.[0]?.id || f.serverType),
      }))
    } catch {
      /* keep manual fields */
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [s, p, k] = await Promise.all([
        apiService.cloudListServers(),
        apiService.cloudListProviders(),
        apiService.cloudListSshKeys(),
      ])
      setRows(s.data || [])
      setProviders(p.data || [])
      setSshKeys(k.data || [])
      if (p.data?.[0]) {
        setForm((f) => {
          const next = f.providerId || p.data![0].id
          return { ...f, providerId: next }
        })
      }
    } catch (e: any) {
      setError(e.message || 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (form.providerId) loadCatalog(form.providerId)
  }, [form.providerId, loadCatalog])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const selectedKey = sshKeys.find((k) => k.id === form.sshKeyId)
      await apiService.cloudCreateServer({
        providerId: form.providerId,
        name: form.name,
        serverType: form.serverType,
        image: form.image,
        location: form.location,
        userData: form.userData || undefined,
        sshKeys: selectedKey?.external_id
          ? [selectedKey.external_id]
          : form.sshKeyId
            ? [form.sshKeyId]
            : undefined,
        enableIpv4: true,
        enableIpv6: true,
      })
      setShowForm(false)
      setForm((f) => ({ ...f, name: '', userData: '', sshKeyId: '' }))
      await load()
    } catch (err: any) {
      setError(err.message || 'Oluşturma başarısız')
    } finally {
      setSaving(false)
    }
  }

  const act = async (id: string, action: 'reboot' | 'power-on' | 'power-off' | 'delete') => {
    try {
      if (action === 'delete') {
        if (!window.confirm('Sunucu silinsin mi?')) return
        await apiService.cloudDeleteServer(id)
      } else if (action === 'reboot') await apiService.cloudRebootServer(id)
      else if (action === 'power-on') await apiService.cloudPowerOnServer(id)
      else await apiService.cloudPowerOffServer(id)
      await load()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const fieldClass =
    'rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Servers</h2>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="rounded-lg border px-2 py-1 text-xs dark:border-slate-700">
            <RefreshCw className="inline h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white dark:bg-lime-500 dark:text-slate-900"
          >
            <Plus className="h-3.5 w-3.5" /> Provision
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={create} className="grid max-w-lg gap-2 rounded-xl border p-4 dark:border-slate-700">
          <label className="grid gap-1 text-xs text-slate-500">
            Provider
            <select
              className={fieldClass}
              value={form.providerId}
              onChange={(e) => setForm({ ...form, providerId: e.target.value })}
              required
            >
              <option value="">Provider seçin</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            Sunucu adı
            <input
              className={fieldClass}
              placeholder="web-01"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-slate-500">
              Size
              {sizes.length ? (
                <select
                  className={fieldClass}
                  value={form.serverType}
                  onChange={(e) => setForm({ ...form, serverType: e.target.value })}
                >
                  {sizes.map((s) => (
                    <option key={s.id} value={s.name || s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={fieldClass}
                  value={form.serverType}
                  onChange={(e) => setForm({ ...form, serverType: e.target.value })}
                  placeholder="cx22"
                  required
                />
              )}
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              Image
              {images.length ? (
                <select
                  className={fieldClass}
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                >
                  {images.map((s) => (
                    <option key={s.id} value={s.name || s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={fieldClass}
                  value={form.image}
                  onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="ubuntu-22.04"
                  required
                />
              )}
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              Region
              {regions.length ? (
                <select
                  className={fieldClass}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                >
                  {regions.map((s) => (
                    <option key={s.id} value={s.name || s.id}>
                      {s.name || s.id}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={fieldClass}
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="nbg1"
                  required
                />
              )}
            </label>
          </div>
          <label className="grid gap-1 text-xs text-slate-500">
            SSH Key
            <select
              className={fieldClass}
              value={form.sshKeyId}
              onChange={(e) => setForm({ ...form, sshKeyId: e.target.value })}
            >
              <option value="">Yok / sonra ekle</option>
              {sshKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-500">
            User-data / cloud-init
            <textarea
              className={fieldClass}
              rows={3}
              placeholder="#cloud-config&#10;packages:&#10;  - nginx"
              value={form.userData}
              onChange={(e) => setForm({ ...form, userData: e.target.value })}
            />
          </label>
          <button
            type="submit"
            disabled={saving || !providers.length}
            className="rounded-lg bg-teal-700 py-2 text-sm text-white dark:bg-lime-500 dark:text-slate-900"
          >
            {saving ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Oluştur (async provision)'}
          </button>
          {!providers.length && (
            <p className="text-xs text-amber-600">Önce Providers sekmesinden provider ekleyin.</p>
          )}
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
                <th className="px-3 py-2">Ad</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2">Tip / Image</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">İşlem</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {rows.map((r) => (
                <tr key={r.id} className="border-t dark:border-slate-800">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {r.server_type} · {r.image} · {r.location}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.ipv4 || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button type="button" title="Reboot" onClick={() => act(r.id, 'reboot')} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Power on" onClick={() => act(r.id, 'power-on')} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Power off" onClick={() => act(r.id, 'power-off')} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <PowerOff className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" title="Delete" onClick={() => act(r.id, 'delete')} className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                    Sunucu yok — Provision ile oluşturun.
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

export default CloudServersPage
