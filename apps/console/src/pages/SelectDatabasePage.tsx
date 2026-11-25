import React, { useState } from 'react';
import { useDatabaseConnections } from '../context/DatabaseConnectionsContext';
import { useNavigate } from 'react-router-dom';

const DB_TYPES = [
  { value: 'postgresql', label: 'Database' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'mssql', label: 'SQL Server' },
  { value: 'sqlite', label: 'SQLite' },
  { value: 'oracle', label: 'Oracle' },
];

const defaultPorts: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  mssql: 1433,
  sqlite: 0,
  oracle: 1521,
};

const SelectDatabasePage: React.FC = () => {
  const {
    connections,
    selectedConnection,
    selectConnection,
    addConnection,
    loading,
    refreshConnections,
  } = useDatabaseConnections();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    type: 'postgresql',
    host: '',
    port: defaultPorts['postgresql'],
    username: '',
    password: '',
    database: '',
  });

  const handleSelect = (id: string) => {
    selectConnection(id);
    navigate('/tables');
  };

  const handleOpenModal = () => {
    setForm({
      name: '',
      type: 'postgresql',
      host: '',
      port: defaultPorts['postgresql'],
      username: '',
      password: '',
      database: '',
    });
    setShowModal(true);
  };

  const handleTypeChange = (type: string) => {
    setForm((prev) => ({ ...prev, type, port: defaultPorts[type] }));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: name === 'port' ? Number(value) : value }));
  };

  const handleAdd = () => {
    if (!form.name || !form.type) return;
    addConnection({
      id: `${form.type}-${form.name}-${Date.now()}`,
      ...form,
      type: form.type as any, // DatabaseType olarak cast
      status: 'disconnected',
    });
    setShowModal(false);
  };

  return (
    <div className="flex flex-col items-center justify-center w-full h-[calc(100vh-0px)] bg-[#f8fafb]">
      <div className="w-full max-w-3xl mt-24">
        <div className="mb-8 flex items-center justify-center gap-3">
          <h1 className="text-2xl font-bold text-center">Veritabanı Seç veya Oluştur</h1>
          <button
            type="button"
            onClick={() => refreshConnections()}
            className="text-sm text-blue-600 hover:underline"
          >
            Yenile
          </button>
        </div>
        {loading && (
          <p className="mb-6 text-center text-sm text-gray-500">Bağlantılar yükleniyor…</p>
        )}
        {!loading && connections.length === 0 && (
          <p className="mb-6 text-center text-sm text-gray-500">
            Hesabınıza ait hazır veritabanı bulunamadı.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className={`bg-white rounded-xl shadow-md p-6 flex flex-col items-start border cursor-pointer transition group mx-auto min-w-[260px] max-w-[320px] ${
                selectedConnection?.id === conn.id
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-blue-500'
              }`}
              onClick={() => handleSelect(conn.id)}
            >
              <div className="flex items-center mb-2 w-full">
                <span className="mr-2 text-2xl">
                  {conn.type === 'postgresql' && '🐘'}
                  {conn.type === 'mysql' && '🦦'}
                  {conn.type === 'mssql' && '🪟'}
                  {conn.type === 'sqlite' && '💾'}
                  {conn.type === 'oracle' && '🦉'}
                </span>
                <span className="font-semibold text-lg group-hover:text-blue-600 transition truncate">
                  {conn.name}
                </span>
                {selectedConnection?.id === conn.id && (
                  <span className="ml-auto shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
                    Aktif
                  </span>
                )}
              </div>
              <div className="text-gray-500 text-sm mb-1">
                {(conn.type || 'postgresql').toUpperCase()}
                {conn.plan ? ` · ${conn.plan}` : ''}
              </div>
              <div className="text-xs text-gray-400">
                {conn.database || `${conn.host}:${conn.port}`}
              </div>
              <div className="mt-2 text-xs text-gray-400">
                {conn.status === 'connected'
                  ? 'Hazır'
                  : conn.status === 'error'
                    ? 'Hata'
                    : 'Duraklatılmış'}
              </div>
            </div>
          ))}
          {/* Yeni bağlantı ekle kartı */}
          <div
            className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-xl flex flex-col items-center justify-center p-6 cursor-pointer hover:bg-blue-100 transition min-h-[120px] mx-auto min-w-[260px] max-w-[320px]"
            onClick={handleOpenModal}
          >
            <span className="text-3xl mb-2">+</span>
            <span className="font-medium">Yeni Bağlantı Ekle</span>
          </div>
        </div>
      </div>
      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-xl p-8 w-full max-w-md relative">
            <h2 className="text-xl font-bold mb-6 text-center">Yeni Bağlantı Oluştur</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Bağlantı Adı</label>
                <input name="name" value={form.name} onChange={handleChange} className="w-full border rounded px-3 py-2" placeholder="Örn: Üretim DB" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Veritabanı Türü</label>
                <select name="type" value={form.type} onChange={e => handleTypeChange(e.target.value)} className="w-full border rounded px-3 py-2">
                  {DB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {form.type !== 'sqlite' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Host</label>
                    <input name="host" value={form.host} onChange={handleChange} className="w-full border rounded px-3 py-2" placeholder="localhost" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Port</label>
                    <input name="port" type="number" value={form.port} onChange={handleChange} className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Kullanıcı Adı</label>
                    <input name="username" value={form.username} onChange={handleChange} className="w-full border rounded px-3 py-2" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Şifre</label>
                    <input name="password" type="password" value={form.password} onChange={handleChange} className="w-full border rounded px-3 py-2" />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium mb-1">Veritabanı Adı</label>
                <input name="database" value={form.database} onChange={handleChange} className="w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-8">
              <button className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200" onClick={() => setShowModal(false)}>Vazgeç</button>
              <button className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={handleAdd}>Bağlantı Oluştur</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SelectDatabasePage; 