import React from 'react'
import { Database } from 'lucide-react'
import { useDatabaseConnections } from '../context/DatabaseConnectionsContext'

type Props = {
  className?: string
  /** Compact for toolbars */
  compact?: boolean
}

/**
 * Shared DB instance selector — persists via DatabaseConnectionsContext
 * and drives x-graphcore-instance for Studio APIs.
 */
const InstancePicker: React.FC<Props> = ({ className = '', compact }) => {
  const {
    connections,
    selectedConnection,
    selectConnection,
    loading,
  } = useDatabaseConnections()

  if (loading && connections.length === 0) {
    return (
      <div className={`text-xs text-slate-500 ${className}`.trim()}>
        DB yükleniyor…
      </div>
    )
  }

  if (!connections.length) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded border border-dashed border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800 ${className}`.trim()}
      >
        <Database className="h-3.5 w-3.5" />
        Hazır instance yok
      </div>
    )
  }

  return (
    <label
      className={`inline-flex items-center gap-1.5 ${className}`.trim()}
      title="Aktif veritabanı"
    >
      {!compact && (
        <span className="hidden text-xs font-medium text-slate-500 sm:inline">
          DB
        </span>
      )}
      <select
        className="max-w-[220px] truncate rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        value={selectedConnection?.id || ''}
        onChange={(e) => selectConnection(e.target.value)}
      >
        {connections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.database ? ` · ${c.database}` : ''}
            {c.plan ? ` · ${c.plan}` : ''}
          </option>
        ))}
      </select>
    </label>
  )
}

export default InstancePicker
