import React, { useCallback, useEffect, useState } from 'react'
import { Table, Layers, AlertCircle, Loader2 } from 'lucide-react'
import { apiService, TableInfo } from '../services/api'
import { useDatabaseConnections } from '../context/DatabaseConnectionsContext'
import InstancePicker from '../components/InstancePicker'

const SchemaPage = () => {
  const { selectedConnection } = useDatabaseConnections()
  const instanceKey = selectedConnection?.id || ''
  const [tables, setTables] = useState<TableInfo[]>([])
  const [selected, setSelected] = useState<TableInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!instanceKey) {
      setTables([])
      setSelected(null)
      setError('Önce bir veritabanı seçin')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await apiService.getSchema(instanceKey)
      if (res.success && res.data?.tables) {
        setTables(res.data.tables)
        setSelected(res.data.tables[0] || null)
      } else {
        setTables([])
        setSelected(null)
        setError(
          typeof res.error === 'string'
            ? res.error
            : 'Şema yüklenemedi — Database çalışıyor mu?'
        )
      }
    } catch (e: any) {
      setTables([])
      setSelected(null)
      setError(e?.message || 'Şema yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [instanceKey])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="h-full flex bg-[#f8fafb]">
      <aside className="sidebar-sb w-64">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--sb-border)]">
          <Layers className="h-6 w-6 text-blue-700" />
          <span className="font-semibold text-lg text-gray-800">Schema</span>
        </div>
        <div className="border-b border-[var(--sb-border)] px-3 py-2">
          <InstancePicker />
        </div>
        <nav className="flex-1 overflow-y-auto">
          <div className="px-4 py-2 text-xs text-gray-500 uppercase">Tables</div>
          {loading && (
            <div className="px-4 py-6 text-sm text-gray-500 flex items-center gap-2">
              <Loader2 className="animate-spin h-4 w-4" /> Yükleniyor…
            </div>
          )}
          {error && (
            <div className="px-4 py-3 text-sm text-amber-800 bg-amber-50 m-2 rounded flex gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          <ul className="mb-4">
            {tables.map((t) => (
              <li key={t.name}>
                <button
                  type="button"
                  className={`sidebar-item-sb w-full text-left cursor-pointer ${
                    selected?.name === t.name ? 'sidebar-active-sb' : ''
                  }`}
                  onClick={() => setSelected(t)}
                >
                  <Table className="h-4 w-4 text-gray-400" /> {t.name}
                  <span className="ml-auto text-xs text-gray-400">{t.rowCount}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        {!selected ? (
          <div className="text-gray-500 text-center mt-20">
            Tablo seçin veya Database bağlantısını kontrol edin.
          </div>
        ) : (
          <div className="bg-white border rounded-lg p-6 max-w-3xl">
            <h2 className="font-semibold text-lg mb-1">{selected.name}</h2>
            <p className="text-sm text-gray-500 mb-4">{selected.rowCount} satır</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2">Sütun</th>
                  <th>Tip</th>
                  <th>Nullable</th>
                  <th>PK</th>
                </tr>
              </thead>
              <tbody>
                {(selected.columns || []).map((c) => (
                  <tr key={c.name} className="border-b border-gray-100">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="font-mono text-xs">{c.type}</td>
                    <td>{c.nullable ? 'yes' : 'no'}</td>
                    <td>{c.is_primary ? 'PK' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}

export default SchemaPage
