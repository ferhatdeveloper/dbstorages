import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, RefreshCw } from 'lucide-react'
import { apiService } from '../../services/api'

type Provider = {
  id: string
  name: string
  slug: string
  status: string
  hasApiKey?: boolean
  created_at?: string
}

const CloudProvidersPage: React.FC = () => {
  const [rows, setRows] = useState<Provider[]>([])
  const [slugs, setSlugs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('hetzner')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [p, s] = await Promise.all([
        apiService.cloudListProviders(),
        apiService.cloudSlugs(),
      ])
      setRows(p.data || [])
      setSlugs(s.data || [])
      if (s.data?.length && !s.data.includes(slug)) setSlug(s.data[0])
    } catch (e: any) {
      setError(e.message || 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    load()
  }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiService.cloudCreateProvider({ name, slug, apiKey: apiKey || undefined })
      setName('')
      setApiKey('')
      await load()
    } catch (err: any) {
      setError(err.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <form
        onSubmit={create}
        className="grid max-w-xl gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
      >
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Provider ekle
        </h2>
        <input
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          placeholder="Ad (ör. Prod Cloud)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
        >
          {(slugs.length ? slugs : ['hetzner', 'mock']).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="password"
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
          placeholder="API token (şifreli saklanır; boş = env varsayılanı)"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white dark:bg-lime-500 dark:text-slate-900"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Kaydet
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          Kayıtlı providerlar
        </h2>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1 text-xs text-slate-500"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Yenile
        </button>
      </div>

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2">Ad</th>
                <th className="px-4 py-2">Slug</th>
                <th className="px-4 py-2">API Key</th>
                <th className="px-4 py-2">Durum</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 font-medium">{r.name}</td>
                  <td className="px-4 py-2 font-mono text-xs">{r.slug}</td>
                  <td className="px-4 py-2">{r.hasApiKey ? '✓' : 'env / yok'}</td>
                  <td className="px-4 py-2">{r.status}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                    Henüz provider yok
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

export default CloudProvidersPage
