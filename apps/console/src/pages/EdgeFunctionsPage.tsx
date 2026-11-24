import React, { useCallback, useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { getActiveProjectId } from '../components/ProjectSwitcher';
import { Play, Save, Trash2, Zap } from 'lucide-react';

const DEFAULT_SOURCE = `// dbstorages Edge Function (Node VM MVP — no Deno / no network)
module.exports = async (req) => {
  return {
    status: 200,
    body: {
      message: 'hello from dbstorages',
      method: req.method,
      received: req.body,
    },
  };
};
`;

type FnMeta = { name: string; updatedAt?: string; size?: number };

const EdgeFunctionsPage = () => {
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [fns, setFns] = useState<FnMeta[]>([]);
  const [name, setName] = useState('hello');
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [result, setResult] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInstances = useCallback(async () => {
    const projectId = getActiveProjectId() || undefined;
    const res = await apiService.getInstances(projectId);
    const list = (res.instances || []).filter((i: any) => i.status === 'ready');
    setInstances(list);
    if (!instanceId && list[0]) setInstanceId(list[0].id);
  }, [instanceId]);

  const refreshList = useCallback(async (id: string) => {
    if (!id) return;
    const res = await apiService.listFunctions(id);
    setFns(res.data?.functions || []);
  }, []);

  useEffect(() => {
    loadInstances().catch((e) => setError(e.message));
    const onProj = () => loadInstances().catch(() => {});
    window.addEventListener('graphcore:project', onProj);
    return () => window.removeEventListener('graphcore:project', onProj);
  }, [loadInstances]);

  useEffect(() => {
    if (instanceId) refreshList(instanceId).catch((e) => setError(e.message));
  }, [instanceId, refreshList]);

  const deploy = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiService.deployFunction(instanceId, name, source);
      await refreshList(instanceId);
      setResult('Deploy OK');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const invoke = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiService.invokeFunction(instanceId, name, {
        body: { ping: true },
      });
      setResult(JSON.stringify(res.data ?? res, null, 2));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: string) => {
    setBusy(true);
    try {
      await apiService.deleteFunction(instanceId, n);
      await refreshList(instanceId);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const openFn = async (n: string) => {
    setName(n);
    try {
      const res = await apiService.getFunction(instanceId, n);
      setSource(res.data?.source || '');
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="flex h-full flex-col bg-[#f8fafb]">
      <div className="border-b bg-white px-4 py-4">
        <div className="mb-2 flex items-center gap-2">
          <Zap className="h-5 w-5 text-blue-700" />
          <h1 className="text-xl font-semibold">Edge Functions</h1>
        </div>
        <p className="mb-3 text-sm text-gray-500">
          Node VM worker MVP — Deno Deploy değil. Sandbox&apos;ta ağ/dosya yok; timeout ~3s.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="rounded border px-2 py-1.5 text-sm"
            value={instanceId}
            onChange={(e) => setInstanceId(e.target.value)}
          >
            {instances.length === 0 && <option value="">Instance yok</option>}
            {instances.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} ({i.id.slice(0, 10)})
              </option>
            ))}
          </select>
          <input
            className="rounded border px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="function name"
          />
          <button
            type="button"
            disabled={busy || !instanceId}
            onClick={deploy}
            className="inline-flex items-center gap-1 rounded bg-blue-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> Deploy
          </button>
          <button
            type="button"
            disabled={busy || !instanceId}
            onClick={invoke}
            className="inline-flex items-center gap-1 rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> Invoke
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-red-600">{error}</div>}
      </div>

      <div className="grid flex-1 grid-cols-1 gap-0 md:grid-cols-[220px_1fr]">
        <aside className="border-r bg-white p-3">
          <div className="mb-2 text-xs font-semibold uppercase text-gray-400">Deployed</div>
          <ul className="space-y-1">
            {fns.map((f) => (
              <li key={f.name} className="flex items-center gap-1">
                <button
                  type="button"
                  className="flex-1 truncate rounded px-2 py-1 text-left text-sm hover:bg-gray-50"
                  onClick={() => openFn(f.name)}
                >
                  {f.name}
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  onClick={() => remove(f.name)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {!fns.length && (
              <li className="px-2 text-xs text-gray-400">Henüz fonksiyon yok</li>
            )}
          </ul>
        </aside>
        <div className="flex flex-col gap-3 p-4">
          <textarea
            className="min-h-[280px] flex-1 rounded border bg-white p-3 font-mono text-xs leading-relaxed"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
          />
          {result && (
            <pre className="max-h-48 overflow-auto rounded border bg-slate-900 p-3 text-xs text-emerald-300">
              {result}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};

export default EdgeFunctionsPage;
