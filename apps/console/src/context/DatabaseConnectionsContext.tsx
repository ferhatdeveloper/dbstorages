import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../services/api';

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
          : 'disconnected',
    createdAt: c.createdAt || c.created_at,
    plan: c.plan,
    region: c.region,
  };
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
      const res = await api.getConnections();
      const list = (res.connections || []).map(mapApiConnection);
      setConnections(list);
      setSelectedConnection((prev) => {
        if (prev && list.some((c) => c.id === prev.id)) {
          return list.find((c) => c.id === prev.id) || null;
        }
        return list[0] || null;
      });
    } catch {
      try {
        const res = await api.getInstances();
        const list = (res.instances || []).map(mapApiConnection);
        setConnections(list);
        setSelectedConnection((prev) => {
          if (prev && list.some((c) => c.id === prev.id)) {
            return list.find((c) => c.id === prev.id) || null;
          }
          return list[0] || null;
        });
      } catch {
        setConnections([]);
      }
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
    setSelectedConnection((prev) => (prev?.id === id ? null : prev));
  };

  const selectConnection = (id: string) => {
    const found = connections.find((c) => c.id === id) || null;
    setSelectedConnection(found);
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
