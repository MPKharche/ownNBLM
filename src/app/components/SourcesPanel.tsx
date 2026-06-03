import { useState, useEffect } from 'react';
import { Source, Document } from '../types';
import { api } from '../services/api';
import {
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
  ChevronRight,
  ChevronDown,
  FileText,
  Loader2,
  HardDrive
} from 'lucide-react';

export function SourcesPanel() {
  const [sources, setSources] = useState<Source[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());
  const [documentsBySource, setDocumentsBySource] = useState<Map<string, Document[]>>(new Map());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSourcePath, setNewSourcePath] = useState('');
  const [newSourceLabel, setNewSourceLabel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSources();
  }, []);

  const loadSources = async () => {
    setLoading(true);
    try {
      const data = await api.getSources();
      setSources(data);
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = async (sourceId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
      if (!documentsBySource.has(sourceId)) {
        const docs = await api.getDocuments(sourceId);
        setDocumentsBySource(new Map(documentsBySource).set(sourceId, docs));
      }
    }
    setExpandedSources(newExpanded);
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSourcePath || !newSourceLabel) return;

    await api.addSource(newSourcePath, newSourceLabel);
    setShowAddDialog(false);
    setNewSourcePath('');
    setNewSourceLabel('');
    loadSources();
  };

  const handleRescan = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.rescanSource(sourceId);
    setTimeout(loadSources, 200);
  };

  const handleDelete = async (sourceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this source and all its documents?')) {
      await api.deleteSource(sourceId);
      loadSources();
    }
  };

  const getStatusIcon = (status: Source['status']) => {
    switch (status) {
      case 'scanning':
      case 'indexing':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'error':
        return <span className="w-4 h-4 text-red-500">!</span>;
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground">Sources</h2>
          <button
            onClick={() => setShowAddDialog(true)}
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            title="Add source"
          >
            <Plus className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="text-sm text-muted-foreground">
          {sources.reduce((sum, s) => sum + s.documentCount, 0)} documents
        </div>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : sources.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
            <p>No sources added yet</p>
            <p className="mt-1">Click + to add a folder</p>
          </div>
        ) : (
          sources.map(source => (
            <div key={source.id} className="border-b border-border">
              <div
                className="p-3 hover:bg-accent cursor-pointer transition-colors"
                onClick={() => toggleSource(source.id)}
              >
                <div className="flex items-start gap-2">
                  <button className="mt-0.5">
                    {expandedSources.has(source.id) ? (
                      <ChevronDown className="w-4 h-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-500" />
                    )}
                  </button>
                  <HardDrive className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-foreground truncate">
                        {source.label}
                      </span>
                      {getStatusIcon(source.status)}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5">
                      {source.path}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-xs text-muted-foreground">
                        {source.documentCount} docs
                      </span>
                      {source.lastScanAt && (
                        <span className="text-xs text-muted-foreground/70">
                          {new Date(source.lastScanAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => handleRescan(source.id, e)}
                      className="p-1 hover:bg-accent rounded"
                      title="Rescan"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => handleDelete(source.id, e)}
                      className="p-1 hover:bg-destructive/10 rounded"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Documents */}
              {expandedSources.has(source.id) && (
                <div className="bg-muted/30 border-t border-border">
                  {documentsBySource.get(source.id)?.map(doc => (
                    <div
                      key={doc.id}
                      className="p-2 pl-10 hover:bg-accent cursor-pointer flex items-center gap-2 text-sm"
                    >
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-foreground">{doc.name}</div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          <span className="uppercase">{doc.format}</span>
                          {doc.pageCount && <span>{doc.pageCount} pages</span>}
                          <span>{formatFileSize(doc.fileSize)}</span>
                        </div>
                      </div>
                      <div className={`text-xs px-2 py-0.5 rounded ${
                        doc.indexStatus === 'indexed'
                          ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                          : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                      }`}>
                        {doc.indexStatus}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Add Source Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md mx-4 border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Add Source</h3>
            <form onSubmit={handleAddSource}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Label
                  </label>
                  <input
                    type="text"
                    value={newSourceLabel}
                    onChange={(e) => setNewSourceLabel(e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="My Documents"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Path
                  </label>
                  <input
                    type="text"
                    value={newSourcePath}
                    onChange={(e) => setNewSourcePath(e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="C:\Users\...\Documents"
                    required
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddDialog(false)}
                  className="flex-1 px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                >
                  Add Source
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
