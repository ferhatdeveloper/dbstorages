import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Database, Plus, Search, X } from 'lucide-react'
import { useDatabaseConnections } from '../context/DatabaseConnectionsContext'
import {
  CloudPageHeader,
  cloudBtnGhost,
  cloudBtnPrimary,
  cloudFieldClass,
  cloudPanelClass,
  cloudTableWrap,
  cloudTd,
  cloudTh,
  cloudThead,
  cloudTr,
} from './cloud/cloudUi'

const DB_TYPES = [
  { value: 'postgresql', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'oracle', label: 'Oracle' },
]

const defaultPorts: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
  oracle: 1521,
}

function planBadge(plan?: string) {
  const p = String(plan || 'starter').toLowerCase()
  if (p === 'pro')
    return 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
  if (p === 'scale')
    return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
  return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
}

function statusPill(status?: string) {
  if (status === 'connected') {
    return {
      label: 'Hazır',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
    }
  }
  if (status === 'error') {
    return {
      label: 'Hata',
      className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    }
  }
  return {
    label: 'Duraklatılmış',
    className:
      'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  }
}

const SelectDatabasePage: React.FC = () => {
  const {
    connections,
    selectedConnection,
    selectConnection,
    addConnection,
    loading,
    refreshConnections,
  } = useDatabaseConnections()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    name: '',
    type: 'postgresql',
    host: '',
    port: defaultPorts.postgresql,
    username: '',
    password: '',
    database: '',
  })

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return connections
    return connections.filter((c) =>
      [c.name, c.database, c.plan, c.host]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle))
    )
  }, [connections, q])

  const handleSelect = (id: string) => {
    selectConnection(id)
    navigate('/tables')
  }

  const handleOpenModal = () => {
    setForm({
      name: '',
      type: 'postgresql',
      host: '',
      port: defaultPorts.postgresql,
      username: '',
      password: '',
      database: '',
    })
    setShowModal(true)
  }

  const handleTypeChange = (type: string) => {
    setForm((prev) => ({ ...prev, type, port: defaultPorts[type] }))
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: name === 'port' ? Number(value) : value,
    }))
  }

  const handleAdd = () => {
    if (!form.name || !form.type) return
    addConnection({
      id: `${form.type}-${form.name}-${Date.now()}`,
      ...form,
      type: form.type as any,
      status: 'disconnected',
    })
    setShowModal(false)
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
      <CloudPageHeader
        title="Veritabanları"
        description="Hazır instance seçin; Studio Table / SQL / Schema bu seçime bağlanır."
        onRefresh={() => refreshConnections()}
        refreshing={loading}
        actions={
          <button type="button" onClick={handleOpenModal} className={cloudBtnPrimary}>
            <Plus className="h-3.5 w-3.5" /> Yeni bağlantı
          </button>
        }
      />

      <div className={`${cloudPanelClass} p-3`}>
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ada veya database koduna göre ara…"
            className={`${cloudFieldClass} pl-9`}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {loading
            ? 'Yükleniyor…'
            : `${filtered.length} / ${connections.length} veritabanı`}
        </p>
      </div>

      {!loading && connections.length === 0 ? (
        <div className={`${cloudPanelClass} px-6 py-16 text-center`}>
          <Database className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-800 dark:text-slate-100">
            Hazır veritabanı yok
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Provision edilen instance’lar burada listelenir.
          </p>
          <button
            type="button"
            onClick={handleOpenModal}
            className={`${cloudBtnPrimary} mt-4`}
          >
            <Plus className="h-3.5 w-3.5" /> Bağlantı ekle
          </button>
        </div>
      ) : (
        <div className={cloudTableWrap}>
          <table className="w-full text-left text-sm">
            <thead className={cloudThead}>
              <tr>
                <th className={cloudTh}>Ad</th>
                <th className={cloudTh}>Database</th>
                <th className={cloudTh}>Plan</th>
                <th className={cloudTh}>Durum</th>
                <th className={cloudTh}>İşlem</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900">
              {filtered.map((conn) => {
                const active = selectedConnection?.id === conn.id
                return (
                  <tr
                    key={conn.id}
                    className={`${cloudTr} cursor-pointer ${
                      active ? 'bg-blue-50/70 dark:bg-red-600/10' : ''
                    }`}
                    onClick={() => handleSelect(conn.id)}
                  >
                    <td className={`${cloudTd}`}>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <Database className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-slate-900 dark:text-slate-100">
                              {conn.name}
                            </span>
                            {active && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                <Check className="h-2.5 w-2.5" /> Aktif
                              </span>
                            )}
                          </div>
                          <div className="truncate text-[11px] text-slate-400">
                            {(conn.type || 'postgresql').toUpperCase()}
                            {conn.region ? ` · ${conn.region}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className={`${cloudTd} font-mono text-xs text-slate-600 dark:text-slate-300`}>
                      {conn.database || '—'}
                    </td>
                    <td className={cloudTd}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${planBadge(
                          conn.plan
                        )}`}
                      >
                        {conn.plan || 'starter'}
                      </span>
                    </td>
                    <td className={cloudTd}>
                      {(() => {
                        const s = statusPill(conn.status)
                        return (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.className}`}
                          >
                            {s.label}
                          </span>
                        )
                      })()}
                    </td>
                    <td className={cloudTd}>
                      <button
                        type="button"
                        className={cloudBtnGhost}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelect(conn.id)
                        }}
                      >
                        Studio
                      </button>
                    </td>
                  </tr>
                )
              })}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    Aramayla eşleşen veritabanı yok.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div
            className={`${cloudPanelClass} relative w-full max-w-md p-5 shadow-xl`}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Yeni bağlantı
                </h2>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Harici Postgres / MySQL bağlantısı ekleyin.
                </p>
              </div>
              <button
                type="button"
                className={cloudBtnGhost}
                onClick={() => setShowModal(false)}
                aria-label="Kapat"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Bağlantı adı
                </label>
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className={cloudFieldClass}
                  placeholder="Örn: Üretim DB"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Tür
                </label>
                <select
                  name="type"
                  value={form.type}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  className={cloudFieldClass}
                >
                  {DB_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {form.type !== 'sqlite' && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">
                        Host
                      </label>
                      <input
                        name="host"
                        value={form.host}
                        onChange={handleChange}
                        className={cloudFieldClass}
                        placeholder="localhost"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">
                        Port
                      </label>
                      <input
                        name="port"
                        type="number"
                        value={form.port}
                        onChange={handleChange}
                        className={cloudFieldClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">
                        Kullanıcı
                      </label>
                      <input
                        name="username"
                        value={form.username}
                        onChange={handleChange}
                        className={cloudFieldClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-slate-500">
                        Şifre
                      </label>
                      <input
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={handleChange}
                        className={cloudFieldClass}
                      />
                    </div>
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-[11px] font-medium text-slate-500">
                  Database adı
                </label>
                <input
                  name="database"
                  value={form.database}
                  onChange={handleChange}
                  className={cloudFieldClass}
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={cloudBtnGhost}
                onClick={() => setShowModal(false)}
              >
                Vazgeç
              </button>
              <button type="button" className={cloudBtnPrimary} onClick={handleAdd}>
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default SelectDatabasePage
