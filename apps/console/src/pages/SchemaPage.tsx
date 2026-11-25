import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Table,
  Layers,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronDown,
  KeyRound,
  Link2,
  Eye,
  RefreshCw,
  Database,
} from 'lucide-react'
import { apiService, TableInfo, ColumnInfo } from '../services/api'
import { useDatabaseConnections } from '../context/DatabaseConnectionsContext'
import InstancePicker from '../components/InstancePicker'

type SchemaBundle = {
  name: string
  tables: TableInfo[]
  views: TableInfo[]
}

const SchemaPage = () => {
  const { selectedConnection } = useDatabaseConnections()
  const instanceKey = selectedConnection?.id || ''
  const [schemas, setSchemas] = useState<SchemaBundle[]>([])
  const [selected, setSelected] = useState<TableInfo | null>(null)
  const [expandedSchemas, setExpandedSchemas] = useState<Record<string, boolean>>({
    public: true,
  })
  const [expandedTables, setExpandedTables] = useState<Record<string, boolean>>({})
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    'public:tables': true,
    'public:views': false,
  })
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const load = useCallback(async () => {
    if (!instanceKey) {
      setSchemas([])
      setSelected(null)
      setError('Önce bir veritabanı seçin')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await apiService.getSchema(instanceKey)
      if (res.success && res.data) {
        const bundle: SchemaBundle[] =
          res.data.schemas?.length
            ? res.data.schemas
            : [
                {
                  name: 'public',
                  tables: res.data.tables || [],
                  views: res.data.views || [],
                },
              ]
        setSchemas(bundle)
        const first =
          bundle[0]?.tables?.[0] || bundle[0]?.views?.[0] || null
        setSelected((prev) => {
          if (prev) {
            const still = bundle
              .flatMap((s) => [...s.tables, ...s.views])
              .find((t) => t.name === prev.name)
            if (still) return still
          }
          return first
        })
        setExpandedSchemas((e) => ({ ...e, [bundle[0]?.name || 'public']: true }))
      } else {
        setSchemas([])
        setSelected(null)
        setError(
          typeof res.error === 'string'
            ? res.error
            : 'Şema yüklenemedi — Database çalışıyor mu?'
        )
      }
    } catch (e: any) {
      setSchemas([])
      setSelected(null)
      setError(e?.message || 'Şema yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [instanceKey])

  useEffect(() => {
    load()
  }, [load])

  const totalTables = useMemo(
    () => schemas.reduce((n, s) => n + (s.tables?.length || 0), 0),
    [schemas]
  )

  const syncFromRetailEx = async () => {
    if (!instanceKey) return
    setSyncing(true)
    setInfo('')
    setError('')
    try {
      const res = await apiService.syncSchemaFromRetailEx(instanceKey)
      if (!res.success) {
        throw new Error(
          typeof res.error === 'string' ? res.error : 'Şema senkronu başarısız'
        )
      }
      const d = res.data
      setInfo(
        `Şema senkronu: kaynak ${d?.tablesInSource ?? '?'} tablo · +${d?.created ?? 0} oluşturuldu · +${d?.altered ?? 0} kolon`
      )
      await load()
    } catch (e: any) {
      setError(e?.message || 'Şema senkronu başarısız')
    } finally {
      setSyncing(false)
    }
  }

  const toggleSchema = (name: string) =>
    setExpandedSchemas((e) => ({ ...e, [name]: !e[name] }))

  const toggleGroup = (key: string) =>
    setExpandedGroups((e) => ({ ...e, [key]: !e[key] }))

  const toggleTableCols = (name: string) =>
    setExpandedTables((e) => ({ ...e, [name]: !e[name] }))

  const renderColumnRow = (c: ColumnInfo) => (
    <button
      key={c.name}
      type="button"
      className="w-full flex items-center gap-1.5 pl-12 pr-3 py-1 text-left text-xs hover:bg-slate-100/80 text-slate-700"
      onClick={() => {
        /* column focus stays on parent table */
      }}
      title={[
        c.type,
        c.nullable ? 'nullable' : 'not null',
        c.is_primary ? 'PK' : '',
        c.is_foreign_key
          ? `FK → ${c.referenced_table}.${c.referenced_column}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ')}
    >
      {c.is_primary ? (
        <KeyRound className="h-3 w-3 text-amber-600 shrink-0" />
      ) : c.is_foreign_key ? (
        <Link2 className="h-3 w-3 text-sky-600 shrink-0" />
      ) : (
        <span className="w-3 shrink-0" />
      )}
      <span className="font-medium truncate">{c.name}</span>
      <span className="ml-auto font-mono text-[10px] text-slate-400 truncate max-w-[40%]">
        {c.type}
      </span>
    </button>
  )

  const renderObject = (t: TableInfo, isView: boolean) => {
    const open = expandedTables[t.name]
    return (
      <li key={t.name}>
        <div className="flex items-stretch">
          <button
            type="button"
            className="px-1 text-slate-400 hover:text-slate-700"
            onClick={() => toggleTableCols(t.name)}
            aria-label="Kolonları aç/kapa"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            className={`flex-1 flex items-center gap-2 py-1.5 pr-3 text-left text-sm rounded-r ${
              selected?.name === t.name
                ? 'bg-blue-50 text-blue-900'
                : 'hover:bg-slate-100'
            }`}
            onClick={() => {
              setSelected(t)
              setExpandedTables((e) => ({ ...e, [t.name]: true }))
            }}
          >
            {isView ? (
              <Eye className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            ) : (
              <Table className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            )}
            <span className="truncate">{t.name}</span>
            <span className="ml-auto text-[10px] text-slate-400 tabular-nums">
              {(t.columns || []).length}
            </span>
          </button>
        </div>
        {open && (
          <div className="border-l border-slate-200 ml-3 mb-1">
            {(t.columns || []).map(renderColumnRow)}
            {!t.columns?.length && (
              <div className="pl-12 py-1 text-[11px] text-slate-400">Kolon yok</div>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <div className="h-full flex bg-[#f8fafb]">
      <aside className="sidebar-sb w-80 flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--sb-border)]">
          <Layers className="h-6 w-6 text-blue-700" />
          <div className="min-w-0">
            <div className="font-semibold text-lg text-gray-800 leading-tight">Schema</div>
            <div className="text-[11px] text-slate-500">
              {totalTables} tablo · pgAdmin görünümü
            </div>
          </div>
          <button
            type="button"
            className="ml-auto p-1.5 rounded hover:bg-slate-100 text-slate-500"
            onClick={() => load()}
            title="Yenile"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="border-b border-[var(--sb-border)] px-3 py-2 space-y-2">
          <InstancePicker />
          <button
            type="button"
            disabled={!instanceKey || syncing}
            onClick={syncFromRetailEx}
            className="w-full text-xs px-2.5 py-1.5 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 flex items-center justify-center gap-1.5"
            title="RetailEX OpenAPI şemasından tüm tabloları oluştur"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Database className="h-3.5 w-3.5" />
            )}
            RetailEX şemasını içe aktar
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
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
          {info && (
            <div className="px-3 py-2 mx-2 mb-2 text-[11px] text-emerald-800 bg-emerald-50 rounded">
              {info}
            </div>
          )}
          {!loading &&
            schemas.map((schema) => {
              const open = expandedSchemas[schema.name] !== false
              const tablesKey = `${schema.name}:tables`
              const viewsKey = `${schema.name}:views`
              return (
                <div key={schema.name} className="mb-1">
                  <button
                    type="button"
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-100"
                    onClick={() => toggleSchema(schema.name)}
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    <Database className="h-3.5 w-3.5 text-blue-600" />
                    {schema.name}
                  </button>
                  {open && (
                    <div className="ml-2">
                      <button
                        type="button"
                        className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                        onClick={() => toggleGroup(tablesKey)}
                      >
                        {expandedGroups[tablesKey] !== false ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        Tables
                        <span className="text-slate-400">({schema.tables?.length || 0})</span>
                      </button>
                      {expandedGroups[tablesKey] !== false && (
                        <ul className="mb-2">
                          {(schema.tables || []).map((t) => renderObject(t, false))}
                        </ul>
                      )}
                      <button
                        type="button"
                        className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-50"
                        onClick={() => toggleGroup(viewsKey)}
                      >
                        {expandedGroups[viewsKey] ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        Views
                        <span className="text-slate-400">({schema.views?.length || 0})</span>
                      </button>
                      {expandedGroups[viewsKey] && (
                        <ul className="mb-2">
                          {(schema.views || []).map((t) => renderObject(t, true))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
        </nav>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        {!selected ? (
          <div className="text-gray-500 text-center mt-20">
            Soldan bir tablo seçin. Liste boşsa «RetailEX şemasını içe aktar» ile tüm
            tablo yapılarını yükleyin.
          </div>
        ) : (
          <div className="bg-white border rounded-lg p-6 max-w-4xl shadow-sm">
            <div className="flex items-start gap-3 mb-4">
              {selected.kind === 'view' ? (
                <Eye className="h-5 w-5 text-violet-600 mt-0.5" />
              ) : (
                <Table className="h-5 w-5 text-blue-700 mt-0.5" />
              )}
              <div>
                <h2 className="font-semibold text-lg font-mono">{selected.name}</h2>
                <p className="text-sm text-gray-500">
                  public · {(selected.columns || []).length} kolon
                  {typeof selected.rowCount === 'number'
                    ? ` · ~${selected.rowCount} satır`
                    : ''}
                </p>
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="py-2 pr-2">Sütun</th>
                  <th className="pr-2">Tip</th>
                  <th className="pr-2">Nullable</th>
                  <th className="pr-2">Default</th>
                  <th className="pr-2">Anahtar</th>
                </tr>
              </thead>
              <tbody>
                {(selected.columns || []).map((c) => (
                  <tr key={c.name} className="border-b border-gray-100 align-top">
                    <td className="py-2 font-medium font-mono text-[13px]">{c.name}</td>
                    <td className="font-mono text-xs text-slate-600">{c.type}</td>
                    <td className="text-xs">{c.nullable ? 'YES' : 'NO'}</td>
                    <td className="font-mono text-[11px] text-slate-500 max-w-[180px] truncate">
                      {c.default_value || '—'}
                    </td>
                    <td className="text-xs">
                      {c.is_primary && (
                        <span className="inline-flex items-center gap-1 text-amber-700 mr-2">
                          <KeyRound className="h-3 w-3" /> PK
                        </span>
                      )}
                      {c.is_foreign_key && (
                        <span className="inline-flex items-center gap-1 text-sky-700">
                          <Link2 className="h-3 w-3" />
                          {c.referenced_table}.{c.referenced_column}
                        </span>
                      )}
                      {!c.is_primary && !c.is_foreign_key && '—'}
                    </td>
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
