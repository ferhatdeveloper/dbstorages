import React, { useCallback, useEffect, useState } from 'react'
import { Loader2, Plus, CloudCog } from 'lucide-react'
import { apiService } from '../../services/api'
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

type Provider = {
  id: string
  name: string
  slug: string
  status: string
  hasApiKey?: boolean
  config?: { baseUrl?: string; endpoint?: string }
  created_at?: string
}

const CloudProvidersPage: React.FC = () => {
  const [rows, setRows] = useState<Provider[]>([])
  const [slugs, setSlugs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('hetzner')
  const [endpoint, setEndpoint] = useState('')
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
      const config = endpoint.trim() ? { baseUrl: endpoint.trim() } : undefined
      await apiService.cloudCreateProvider({
        name,
        slug,
        apiKey: apiKey || undefined,
        config,
      })
      setName('')
      setApiKey('')
      setEndpoint('')
      setShowForm(false)
      await load()
    } catch (err: any) {
      setError(err.message || 'Kayıt başarısız')
    } finally {
      setSaving(false)
    }
  }

  const endpointOf = (r: Provider) =>
    r.config?.baseUrl || r.config?.endpoint || '— (varsayılan)'

  return (
    <div className="space-y-4">
      <CloudPageHeader
        title="Providers"
        description="Cloud API sağlayıcıları. Endpoint ve API key şifreli saklanır."
        onRefresh={load}
        refreshing={loading}
        actions={
          <button type="button" onClick={() => setShowForm(true)} className={cloudBtnPrimary}>
            <Plus className="h-3.5 w-3.5" /> Provider ekle
          </button>
        }
      />

      <CloudError message={error} />

      {loading ? (
        <CloudLoading />
      ) : (
        <div className={cloudPanelClass}>
          {!rows.length ? (
            <CloudEmptyState
              icon={<CloudCog className="h-6 w-6" />}
              title="Henüz provider yok"
              description="Hetzner veya mock provider ekleyerek sunucu provision’a başlayın."
              action={
                <button type="button" onClick={() => setShowForm(true)} className={cloudBtnPrimary}>
                  <Plus className="h-3.5 w-3.5" /> Provider ekle
                </button>
              }
            />
          ) : (
            <div className={`${cloudTableWrap} border-0`}>
              <table className="w-full text-left text-sm">
                <thead className={cloudThead}>
                  <tr>
                    <th className={cloudTh}>Ad</th>
                    <th className={cloudTh}>Slug</th>
                    <th className={cloudTh}>Endpoint</th>
                    <th className={cloudTh}>API Key</th>
                    <th className={cloudTh}>Durum</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-slate-900">
                  {rows.map((r) => (
                    <tr key={r.id} className={cloudTr}>
                      <td className={`${cloudTd} font-medium`}>{r.name}</td>
                      <td className={`${cloudTd} font-mono text-xs`}>{r.slug}</td>
                      <td className={`${cloudTd} max-w-[14rem] truncate font-mono text-xs`}>
                        {endpointOf(r)}
                      </td>
                      <td className={`${cloudTd} font-mono text-xs`}>
                        {r.hasApiKey ? '•••••••• (kayıtlı)' : 'env / yok'}
                      </td>
                      <td className={cloudTd}>
                        <CloudStatusPill status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CloudSlideOver
        open={showForm}
        onClose={() => setShowForm(false)}
        title="Provider ekle"
        subtitle="Slug, endpoint ve API key"
        footer={
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => setShowForm(false)} className={cloudBtnGhost}>
              İptal
            </button>
            <button
              type="submit"
              form="cloud-provider-form"
              disabled={saving}
              className={cloudBtnPrimary}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kaydet'}
            </button>
          </div>
        }
      >
        <form id="cloud-provider-form" onSubmit={create} className="space-y-3">
          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            Ad
            <input
              className={cloudFieldClass}
              placeholder="ör. Prod Cloud"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            Slug
            <select
              className={cloudFieldClass}
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            >
              {(slugs.length ? slugs : ['hetzner', 'mock']).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            Endpoint (API base URL, opsiyonel)
            <input
              className={`${cloudFieldClass} font-mono`}
              placeholder="https://api.example.com/v1"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-500 dark:text-slate-400">
            API Key
            <input
              type="password"
              autoComplete="off"
              className={cloudFieldClass}
              placeholder="•••••••• (şifreli saklanır; boş = env varsayılanı)"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </label>
        </form>
      </CloudSlideOver>
    </div>
  )
}

export default CloudProvidersPage
