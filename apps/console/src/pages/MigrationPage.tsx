import React, { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { getActiveProjectId } from '../components/ProjectSwitcher';
import { GitBranch, Play } from 'lucide-react';

/**
 * Migration motor MVP — apply named SQL scripts per instance.
 * Replaces the previous mock-heavy UI.
 */
const MigrationPage: React.FC = () => {
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [applied, setApplied] = useState<any[]>([]);
  const [name, setName] = useState('001_init');
  const [sql, setSql] = useState(
    `-- Example migration\nCREATE TABLE IF NOT EXISTS notes (\n  id SERIAL PRIMARY KEY,\n  body TEXT NOT NULL,\n  created_at TIMESTAMPTZ DEFAULT NOW()\n);\nSELECT public.graphcore_attach_realtime_triggers();`
  );
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const projectId = getActiveProjectId() || undefined;
    const res = await apiService.getInstances(projectId);
    const list = (res.instances || []).filter(
      (i: any) => i.status === 'ready' || i.status === 'paused'
    );
    setInstances(list);
    if (!instanceId && list[0]) setInstanceId(list[0].id);
  }, [instanceId]);

  const refreshApplied = useCallback(async (id: string) => {
    if (!id) return;
    const res = await apiService.listMigrations(id);
    setApplied(res.data || []);
  }, []);

  useEffect(() => {
    load().catch((e) => setError(e.message));
    const onProj = () => load().catch(() => {});
    window.addEventListener('graphcore:project', onProj);
    return () => window.removeEventListener('graphcore:project', onProj);
  }, [load]);

  useEffect(() => {
    if (instanceId) refreshApplied(instanceId).catch((e) => setError(e.message));
  }, [instanceId, refreshApplied]);

  const apply = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await apiService.applyMigration(instanceId, { name, sql });
      setMsg(JSON.stringify(res.data));
      await refreshApplied(instanceId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full bg-[#f8fafb] p-6">
      <div className="mb-4 flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-blue-700" />
        <div>
          <h1 className="text-xl font-semibold">Migrations</h1>
          <p className="text-sm text-gray-500">
            Instance başına SQL migration uygula (`_graphcore_migrations` ile izlenir).
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <select
          className="rounded border px-2 py-1.5 text-sm"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
        >
          {instances.length === 0 && <option value="">Instance yok</option>}
          {instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {i.status}
            </option>
          ))}
        </select>
        <input
          className="rounded border px-2 py-1.5 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="migration name"
        />
        <button
          type="button"
          disabled={busy || !instanceId}
          onClick={apply}
          className="inline-flex items-center gap-1 rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          <Play className="h-4 w-4" /> Apply
        </button>
      </div>

      {error && <div className="mb-3 text-sm text-red-600">{error}</div>}
      {msg && <div className="mb-3 text-sm text-emerald-700">{msg}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <textarea
          className="min-h-[320px] rounded border bg-white p-3 font-mono text-xs"
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          spellCheck={false}
        />
        <div className="rounded border bg-white">
          <div className="border-b px-3 py-2 text-xs font-semibold uppercase text-gray-400">
            Applied
          </div>
          <ul className="divide-y text-sm">
            {applied.length === 0 && (
              <li className="px-3 py-6 text-center text-gray-400">Kayıt yok</li>
            )}
            {applied.map((m) => (
              <li key={m.id} className="px-3 py-2">
                <div className="font-medium">{m.name}</div>
                <div className="text-xs text-gray-500">
                  {m.checksum} · {new Date(m.applied_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MigrationPage;
