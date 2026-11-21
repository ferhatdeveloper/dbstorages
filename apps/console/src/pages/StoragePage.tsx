import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Folder,
  File,
  Upload,
  Download,
  Trash2,
  Copy,
  Eye,
  MoreVertical,
  Search,
  Filter,
  Grid,
  List,
  Plus,
  FolderPlus,
  FileText,
  Image,
  Video,
  Music,
  Archive,
  Code,
  Database,
  Settings,
  Share2,
  Lock,
  Unlock,
  Star,
  StarOff,
  RefreshCw,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Edit,
  Move,
  Rename,
  Info,
  Calendar,
  User,
  HardDrive,
  Cloud,
  Shield,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { apiService } from '../services/api';

// File type icons mapping
const getFileIcon = (fileName: string) => {
  const extension = fileName.split('.').pop()?.toLowerCase();
  
  switch (extension) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'svg':
    case 'webp':
      return <Image className="text-blue-500" size={20} />;
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'wmv':
    case 'flv':
      return <Video className="text-purple-500" size={20} />;
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'aac':
      return <Music className="text-green-500" size={20} />;
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return <Archive className="text-orange-500" size={20} />;
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'html':
    case 'css':
    case 'scss':
    case 'json':
    case 'xml':
    case 'yaml':
    case 'yml':
      return <Code className="text-yellow-500" size={20} />;
    case 'sql':
    case 'db':
    case 'sqlite':
      return <Database className="text-indigo-500" size={20} />;
    case 'pdf':
    case 'doc':
    case 'docx':
    case 'txt':
    case 'rtf':
      return <FileText className="text-red-500" size={20} />;
    default:
      return <File className="text-gray-500" size={20} />;
  }
};

// File/Folder Item Component
const FileItem: React.FC<{
  item: {
    id: string;
    name: string;
    type: 'file' | 'folder';
    size?: number;
    modified: string;
    owner: string;
    permissions: string;
    isPublic: boolean;
    isStarred: boolean;
    path: string;
  };
  onSelect: (item: any) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onMove: (id: string, newPath: string) => void;
  onToggleStar: (id: string) => void;
  onTogglePublic: (id: string) => void;
  onDownload: (id: string) => void;
  onShare: (id: string) => void;
  selected: boolean;
}> = ({ item, onSelect, onDelete, onRename, onMove, onToggleStar, onTogglePublic, onDownload, onShare, selected }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRename = () => {
    if (newName.trim() && newName !== item.name) {
      onRename(item.id, newName.trim());
    }
    setIsRenaming(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRename();
    } else if (e.key === 'Escape') {
      setIsRenaming(false);
      setNewName(item.name);
    }
  };

  return (
    <div
      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
        selected ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'
      }`}
      onClick={() => onSelect(item)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {item.type === 'folder' ? (
            <Folder className="text-yellow-500" size={20} />
          ) : (
            getFileIcon(item.name)
          )}
          
          <div className="flex-1 min-w-0">
            {isRenaming ? (
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyPress}
                onBlur={handleRename}
                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            ) : (
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-900 truncate">{item.name}</span>
                {item.isStarred && <Star className="text-yellow-500" size={14} />}
                {item.isPublic ? <Unlock className="text-green-500" size={14} /> : <Lock className="text-gray-500" size={14} />}
              </div>
            )}
            
            <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
              {item.type === 'file' && item.size && (
                <span>{formatFileSize(item.size)}</span>
              )}
              <span>{formatDate(item.modified)}</span>
              <span>{item.owner}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar(item.id);
            }}
            className="p-1 text-gray-400 hover:text-yellow-500"
          >
            {item.isStarred ? <Star className="text-yellow-500" size={14} /> : <StarOff size={14} />}
          </button>
          
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 text-gray-400 hover:text-gray-600"
            >
              <MoreVertical size={14} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-32">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsRenaming(true);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Edit size={14} />
                  <span>Yeniden Adlandır</span>
                </button>
                
                {item.type === 'file' && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(item.id);
                      setShowMenu(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
                  >
                    <Download size={14} />
                    <span>İndir</span>
                  </button>
                )}
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShare(item.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Share2 size={14} />
                  <span>Paylaş</span>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePublic(item.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center space-x-2"
                >
                  {item.isPublic ? <Lock size={14} /> : <Unlock size={14} />}
                  <span>{item.isPublic ? 'Gizle' : 'Herkese Aç'}</span>
                </button>
                
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(item.id);
                    setShowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-red-100 text-red-600 flex items-center space-x-2"
                >
                  <Trash2 size={14} />
                  <span>Sil</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// File Preview Component
const FilePreview: React.FC<{
  file: any;
  onClose: () => void;
}> = ({ file, onClose }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (file) {
      setLoading(true);
      // Simulate loading preview
      setTimeout(() => {
        setPreviewUrl(`/api/storage/preview/${file.id}`);
        setLoading(false);
      }, 1000);
    }
  }, [file]);

  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return 'image';
      case 'mp4':
      case 'avi':
      case 'mov':
        return 'video';
      case 'mp3':
      case 'wav':
        return 'audio';
      case 'pdf':
        return 'pdf';
      default:
        return 'document';
    }
  };

  const fileType = getFileIcon(file.name);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">{file.name}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
            </div>
          ) : (
            <div className="max-h-96 overflow-auto">
              {fileType === 'image' && (
                <img
                  src={previewUrl || ''}
                  alt={file.name}
                  className="max-w-full h-auto rounded"
                />
              )}
              
              {fileType === 'video' && (
                <video
                  src={previewUrl || ''}
                  controls
                  className="max-w-full h-auto rounded"
                />
              )}
              
              {fileType === 'audio' && (
                <audio
                  src={previewUrl || ''}
                  controls
                  className="w-full"
                />
              )}
              
              {fileType === 'pdf' && (
                <iframe
                  src={previewUrl || ''}
                  className="w-full h-96 border rounded"
                  title={file.name}
                />
              )}
              
              {fileType === 'document' && (
                <div className="bg-gray-100 p-8 rounded text-center">
                  <FileText className="mx-auto h-16 w-16 text-gray-400 mb-4" />
                  <p className="text-gray-600">Bu dosya türü için önizleme mevcut değil</p>
                  <button
                    onClick={() => window.open(previewUrl, '_blank')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Dosyayı Aç
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const StoragePage: React.FC = () => {
  // State management
  const [files, setFiles] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState('/');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'files' | 'folders'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'modified' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showUpload, setShowUpload] = useState(false);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [showShare, setShowShare] = useState(false);
  const [shareItem, setShareItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showToast, setShowToast] = useState<{type: 'success' | 'error', message: string} | null>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const [instanceId, setInstanceId] = useState('');
  const [storageBackend, setStorageBackend] = useState('');

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  // Toast notification
  const showNotification = useCallback((type: 'success' | 'error', message: string) => {
    setShowToast({ type, message });
    setTimeout(() => setShowToast(null), 3000);
  }, []);

  useEffect(() => {
    apiService
      .getInstances()
      .then((res) => {
        const list = res.instances || [];
        setInstances(list);
        const ready = list.find((i: any) => i.status === 'ready');
        if (ready) setInstanceId(ready.id);
      })
      .catch((e: any) => showNotification('error', e.message || 'Instance listesi alınamadı'));
    apiService
      .storageStatus()
      .then((res) => setStorageBackend(res.data?.backend || ''))
      .catch(() => {});
  }, [showNotification]);

  // Load files when path / instance changes
  useEffect(() => {
    loadFiles();
  }, [currentPath, instanceId]);

  const prefixOf = (path: string) =>
    path === '/' ? '' : path.replace(/^\/+/, '').replace(/\/$/, '');

  // Load files from Storage API (MinIO / local)
  const loadFiles = async () => {
    if (!instanceId) {
      setFiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiService.listStorageObjects(instanceId, prefixOf(currentPath));
      setFiles(res.data?.files || []);
      if (res.data?.backend) setStorageBackend(res.data.backend);
    } catch (error: any) {
      showNotification('error', error.message || 'Dosyalar yüklenirken hata oluştu');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort files
  const filteredAndSortedFiles = files
    .filter(file => {
      if (searchQuery) {
        return file.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      if (filterType === 'files') return file.type === 'file';
      if (filterType === 'folders') return file.type === 'folder';
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = (a.size || 0) - (b.size || 0);
          break;
        case 'modified':
          comparison = new Date(a.modified).getTime() - new Date(b.modified).getTime();
          break;
        case 'type':
          comparison = a.type.localeCompare(b.type);
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  // File operations
  const handleFileSelect = (file: any) => {
    if (file.type === 'folder') {
      setCurrentPath(file.path);
      setSelectedItems([]);
    } else {
      setSelectedItems(prev => 
        prev.includes(file.id) 
          ? prev.filter(id => id !== file.id)
          : [...prev, file.id]
      );
    }
  };

  const handleFileDelete = async (id: string) => {
    if (!instanceId) return;
    try {
      await apiService.deleteFile(id, instanceId);
      setFiles((prev) => prev.filter((file) => file.id !== id));
      setSelectedItems((prev) => prev.filter((itemId) => itemId !== id));
      showNotification('success', 'Dosya başarıyla silindi');
    } catch (error: any) {
      showNotification('error', error.message || 'Dosya silinirken hata oluştu');
    }
  };

  const handleFileRename = async (id: string, newName: string) => {
    showNotification('error', 'Yeniden adlandırma henüz desteklenmiyor');
    void id;
    void newName;
  };

  const handleFileMove = async (id: string, newPath: string) => {
    showNotification('error', 'Taşıma henüz desteklenmiyor');
    void id;
    void newPath;
  };

  const handleToggleStar = async (id: string) => {
    setFiles((prev) =>
      prev.map((file) =>
        file.id === id ? { ...file, isStarred: !file.isStarred } : file
      )
    );
  };

  const handleTogglePublic = async (id: string) => {
    setFiles((prev) =>
      prev.map((file) =>
        file.id === id ? { ...file, isPublic: !file.isPublic } : file
      )
    );
  };

  const handleFileDownload = async (id: string) => {
    if (!instanceId) return;
    try {
      const file = files.find((f) => f.id === id);
      if (!file) return;
      const res = await apiService.downloadFile(id, instanceId);
      if (!res.success || !('blob' in res) || !res.blob) {
        throw new Error((res as any).error || 'İndirme başarısız');
      }
      const url = URL.createObjectURL(res.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = res.filename || file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('success', 'Dosya indirme başlatıldı');
    } catch (error: any) {
      showNotification('error', error.message || 'Dosya indirilirken hata oluştu');
    }
  };

  const handleFileShare = (id: string) => {
    const file = files.find(f => f.id === id);
    if (file) {
      setShareItem(file);
      setShowShare(true);
    }
  };

  const handleFilePreview = (file: any) => {
    setPreviewFile(file);
    setShowPreview(true);
  };

  // Upload functionality
  const handleFileUpload = async (fileList: FileList) => {
    if (!instanceId) {
      showNotification('error', 'Önce bir instance seçin');
      return;
    }
    const uploadPromises = Array.from(fileList).map(async (file) => {
      const uploadId = `${Date.now()}-${file.name}`;
      setUploadProgress((prev) => ({ ...prev, [uploadId]: 30 }));
      try {
        const res = await apiService.uploadFile(
          file,
          instanceId,
          prefixOf(currentPath)
        );
        setUploadProgress((prev) => ({ ...prev, [uploadId]: 100 }));
        const data = res.data || {};
        setFiles((prev) => [
          {
            id: data.id || data.key || uploadId,
            name: data.name || file.name,
            type: 'file' as const,
            size: data.size || file.size,
            modified: data.modified || new Date().toISOString(),
            owner: 'you',
            permissions: 'rw',
            isPublic: false,
            isStarred: false,
            path: data.path || `/${file.name}`,
            key: data.key,
          },
          ...prev,
        ]);
        showNotification('success', `${file.name} başarıyla yüklendi`);
      } catch (error: any) {
        showNotification('error', error.message || `${file.name} yüklenirken hata oluştu`);
      } finally {
        setUploadProgress((prev) => {
          const next = { ...prev };
          delete next[uploadId];
          return next;
        });
      }
    });

    await Promise.all(uploadPromises);
    await loadFiles();
  };

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      showNotification('error', 'Klasör adı boş olamaz');
      return;
    }
    if (!instanceId) {
      showNotification('error', 'Önce bir instance seçin');
      return;
    }

    try {
      await apiService.createStorageFolder(
        instanceId,
        newFolderName.trim(),
        prefixOf(currentPath)
      );
      setNewFolderName('');
      setShowCreateFolder(false);
      showNotification('success', 'Klasör başarıyla oluşturuldu');
      await loadFiles();
    } catch (error: any) {
      showNotification('error', error.message || 'Klasör oluşturulurken hata oluştu');
    }
  };

  // Drag and drop
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files);
    }
  };

  // Breadcrumb navigation
  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Toast Notification */}
      {showToast && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg ${
          showToast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          <div className="flex items-center space-x-2">
            {showToast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
            <span>{showToast.message}</span>
            <button onClick={() => setShowToast(null)} className="ml-2">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-semibold text-gray-900">Storage</h1>
              <select
                value={instanceId}
                onChange={(e) => {
                  setInstanceId(e.target.value);
                  setCurrentPath('/');
                }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              >
                <option value="">Instance seçin…</option>
                {instances.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name || i.id} ({i.status})
                  </option>
                ))}
              </select>
              {storageBackend && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Cloud size={14} />
                  {storageBackend === 's3' ? 'MinIO/S3' : 'yerel disk'}
                </span>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowCreateFolder(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <FolderPlus size={16} />
                <span>Yeni Klasör</span>
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-700 text-white rounded-lg hover:bg-blue-800 flex items-center space-x-2"
              >
                <Upload size={16} />
                <span>Dosya Yükle</span>
              </button>
              
              <button
                onClick={loadFiles}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200 px-4 py-2">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPath('/')}
              className="text-blue-600 hover:text-blue-800"
            >
              Ana Dizin
            </button>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center space-x-2">
                <span className="text-gray-400">/</span>
                <button
                  onClick={() => {
                    const path = '/' + breadcrumbs.slice(0, index + 1).join('/');
                    setCurrentPath(path);
                  }}
                  className="text-blue-600 hover:text-blue-800"
                >
                  {crumb}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Toolbar */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Dosyalarda ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tümü</option>
                <option value="files">Dosyalar</option>
                <option value="folders">Klasörler</option>
              </select>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="name">İsim</option>
                <option value="size">Boyut</option>
                <option value="modified">Değiştirilme</option>
                <option value="type">Tür</option>
              </select>
              
              <button
                onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                className="p-2 text-gray-500 hover:text-gray-700"
              >
                {sortOrder === 'asc' ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <Grid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                <List size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* File List */}
        <div 
          className="flex-1 overflow-auto p-4"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="animate-spin h-8 w-8 text-blue-500" />
            </div>
          ) : (
            <div className={`grid gap-4 ${
              viewMode === 'grid' 
                ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6' 
                : 'grid-cols-1'
            }`}>
              {filteredAndSortedFiles.map((file) => (
                <FileItem
                  key={file.id}
                  item={file}
                  onSelect={handleFileSelect}
                  onDelete={handleFileDelete}
                  onRename={handleFileRename}
                  onMove={handleFileMove}
                  onToggleStar={handleToggleStar}
                  onTogglePublic={handleTogglePublic}
                  onDownload={handleFileDownload}
                  onShare={handleFileShare}
                  selected={selectedItems.includes(file.id)}
                />
              ))}
              
              {filteredAndSortedFiles.length === 0 && (
                <div className="col-span-full flex items-center justify-center h-64">
                  <div className="text-center">
                    <Folder className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">Dosya bulunamadı</h3>
                    <p className="mt-1 text-sm text-gray-500">Bu dizinde dosya veya klasör bulunmuyor.</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Upload Progress */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="bg-white border-t border-gray-200 p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Yükleme İlerlemesi</h4>
            {Object.entries(uploadProgress).map(([id, progress]) => (
              <div key={id} className="flex items-center space-x-2 mb-2">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm text-gray-600">{progress}%</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
        className="hidden"
      />

      {/* Create Folder Modal */}
      {showCreateFolder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Yeni Klasör</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Klasör adı"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex items-center justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowCreateFolder(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                İptal
              </button>
              <button
                onClick={handleCreateFolder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Oluştur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {showPreview && previewFile && (
        <FilePreview
          file={previewFile}
          onClose={() => {
            setShowPreview(false);
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
};

export default StoragePage; 