import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { ChevronDown } from 'lucide-react';

const STORAGE_KEY = 'graphcore_active_project';

export function getActiveProjectId(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function setActiveProjectId(id: string) {
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent('graphcore:project', { detail: { id } }));
}

type Project = { id: string; name: string; env?: string; tenantId?: string };

/**
 * Compact project switcher for the Studio sidebar.
 */
const ProjectSwitcher: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(getActiveProjectId());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiService.getProjects();
        if (cancelled) return;
        const list = res.projects || [];
        setProjects(list);
        if (!list.length) return;
        const current = getActiveProjectId();
        const valid = current && list.some((p) => p.id === current);
        if (!valid) {
          setActiveProjectId(list[0].id);
          setActiveId(list[0].id);
        } else {
          setActiveId(current);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Projeler yüklenemedi');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const active = projects.find((p) => p.id === activeId) || projects[0];

  const select = (id: string) => {
    setActiveProjectId(id);
    setActiveId(id);
    setOpen(false);
  };

  if (error) {
    return (
      <div className="mx-3 mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
        {error}
      </div>
    );
  }

  if (!projects.length) {
    return (
      <div className="mx-3 mb-3 rounded border border-dashed border-gray-200 px-2 py-2 text-xs text-gray-500">
        Henüz proje yok
      </div>
    );
  }

  return (
    <div className="relative mx-3 mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-sm hover:bg-gray-100"
      >
        <div className="min-w-0">
          <div className="truncate font-medium text-gray-800">{active?.name}</div>
          <div className="truncate text-[11px] text-gray-500">
            {active?.env || 'dev'} · {active?.id?.slice(0, 12)}
          </div>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-auto rounded-lg border bg-white shadow-lg">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => select(p.id)}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                p.id === active?.id ? 'bg-teal-50 text-teal-800' : 'text-gray-700'
              }`}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-[11px] text-gray-500">{p.env || 'dev'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectSwitcher;
