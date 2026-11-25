import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api, setActiveInstanceId, getActiveInstanceId } from '../services/api';

type DatabaseType = 'postgresql' | 'mysql' | 'mssql' | 'sqlite' | 'oracle';

export interface DatabaseConnection {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  status?: 'connected' | 'disconnected' | 'error';
  createdAt?: string;
  plan?: string;
  region?: string;
  restUrl?: string;
}

interface DatabaseConnectionsContextProps {
  connections: DatabaseConnection[];
  selectedConnection: DatabaseConnection | null;
  loading: boolean;
  refreshConnections: () => Promise<void>;
  addConnection: (conn: DatabaseConnection) => void;
  removeConnection: (id: string) => void;
  selectConnection: (id: string) => void;
  updateConnection: (conn: DatabaseConnection) => void;
}

const DatabaseConnectionsContext = createContext<
  DatabaseConnectionsContextProps | undefined
>(undefined);

function mapApiConnection(c: any): DatabaseConnection {
  return {
    id: c.id,
    name: c.name || c.database || c.database_name || 'Database',
    type: (c.type || 'postgresql') as DatabaseType,
    host: c.host || '',
    port: Number(c.port) || 5432,
    username: c.username || '',
    password: c.password || '',
    database: c.database || c.database_name || '',
    status:
      c.status === 'ready' || c.status === 'connected'
        ? 'connected'
        : c.status === 'error'
          ? 'error'
          : c.status === 'paused'
            ? 'disconnected'
            : 'disconnected',
    createdAt: c.createdAt || c.created_at,
    plan: c.plan,
    region: c.region,
    restUrl: c.restUrl || c.rest_url,
  };
}

function pickInitial(
  list: DatabaseConnection[],
  preferredId: string | null
): DatabaseConnection | null {
  if (!list.length) return null;
  if (preferredId) {
    const found = list.find((c) => c.id === preferredId);
    if (found) return found;
  }
  return list.find((c) => c.status === 'connected') || list[0] || null;
}

export const DatabaseConnectionsProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [connections, setConnections] = useState<DatabaseConnection[]>([]);
  const [selectedConnection, setSelectedConnection] =
    useState<DatabaseConnection | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshConnections = useCallback(async () => {
    setLoading(true);
    try {
      let list: DatabaseConnection[] = [];
      try {
        const res = await api.getInstances();
        list = (res.instances || [])
          .filter((i: any) => i.status !== 'deleted')
          .map(mapApiConnection);
      } catch {
        const res = await api.getConnections();
        list = (res.connections || []).map(mapApiConnection);
      }
      setConnections(list);
      const next = pickInitial(list, getActiveInstanceId());
      setSelectedConnection(next);
      setActiveInstanceId(next?.id || null);
    } catch {
      setConnections([]);
      setSelectedConnection(null);
      setActiveInstanceId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }
    refreshConnections();
  }, [refreshConnections]);

  const addConnection = (conn: DatabaseConnection) => {
    setConnections((prev) => [...prev, conn]);
  };

  const removeConnection = (id: string) => {
    setConnections((prev) => prev.filter((c) => c.id !== id));
    setSelectedConnection((prev) => {
      if (prev?.id !== id) return prev;
      const rest = connections.filter((c) => c.id !== id);
      const next = rest[0] || null;
      setActiveInstanceId(next?.id || null);
      return next;
    });
  };

  const selectConnection = (id: string) => {
    const found = connections.find((c) => c.id === id) || null;
    setSelectedConnection(found);
    setActiveInstanceId(found?.id || null);
  };

  const updateConnection = (conn: DatabaseConnection) => {
    setConnections((prev) => prev.map((c) => (c.id === conn.id ? conn : c)));
    setSelectedConnection((prev) => (prev?.id === conn.id ? conn : prev));
  };

  return (
    <DatabaseConnectionsContext.Provider
      value={{
        connections,
        selectedConnection,
        loading,
        refreshConnections,
        addConnection,
        removeConnection,
        selectConnection,
        updateConnection,
      }}
    >
      {children}
    </DatabaseConnectionsContext.Provider>
  );
};

export const useDatabaseConnections = () => {
  const ctx = useContext(DatabaseConnectionsContext);
  if (!ctx) {
    throw new Error(
      'useDatabaseConnections must be used within DatabaseConnectionsProvider'
    );
  }
  return ctx;
};
