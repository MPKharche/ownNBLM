import { useState, useEffect } from 'react';
import { Session, Document } from '../types';
import { api } from '../services/api';
import {
  MessageSquare,
  Plus,
  Trash2,
  Globe,
  FileText
} from 'lucide-react';

interface SessionPanelProps {
  currentSessionId: string;
  onSessionChange: (sessionId: string) => void;
}

export function SessionPanel({ currentSessionId, onSessionChange }: SessionPanelProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  useEffect(() => {
    loadSessions();
    loadDocuments();
  }, []);

  const loadSessions = async () => {
    const data = await api.getSessions();
    setSessions(data);
  };

  const loadDocuments = async () => {
    const data = await api.getDocuments();
    setDocuments(data);
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSessionName.trim()) return;

    await api.createSession(newSessionName, selectedDocIds);
    setShowNewSessionDialog(false);
    setNewSessionName('');
    setSelectedDocIds([]);
    loadSessions();
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessionId === 'session-corpus') {
      alert('Cannot delete the default corpus session');
      return;
    }
    if (confirm('Delete this session and all its history?')) {
      await api.deleteSession(sessionId);
      if (currentSessionId === sessionId) {
        onSessionChange('session-corpus');
      }
      loadSessions();
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    if (hours < 48) return 'Yesterday';
    return d.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col bg-background border-l border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="font-semibold text-foreground mb-3">Sessions</h2>
        <button
          onClick={() => setShowNewSessionDialog(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Session
        </button>
      </div>

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {sessions.map(session => (
          <div
            key={session.id}
            onClick={() => onSessionChange(session.id)}
            className={`p-3 border-b border-border cursor-pointer transition-colors ${
              currentSessionId === session.id
                ? 'bg-blue-50 dark:bg-blue-950 border-l-4 border-l-blue-600 dark:border-l-blue-400'
                : 'hover:bg-accent'
            }`}
          >
            <div className="flex items-start gap-2">
              {session.mode === 'corpus' ? (
                <Globe className="w-5 h-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
              ) : (
                <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-foreground truncate">
                  {session.name}
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <span>{session.messageCount} messages</span>
                  {session.mode === 'scoped' && (
                    <span>• {session.docIds.length} docs</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatDate(session.lastMessageAt)}
                </div>
              </div>
              {session.id !== 'session-corpus' && (
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="p-1 hover:bg-destructive/10 rounded flex-shrink-0"
                  title="Delete session"
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </button>
              )}
            </div>

            {/* Scoped docs preview */}
            {session.mode === 'scoped' && session.docIds.length > 0 && (
              <div className="mt-2 pl-7 space-y-1">
                {session.docIds.slice(0, 2).map(docId => {
                  const doc = documents.find(d => d.id === docId);
                  return doc ? (
                    <div key={docId} className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      <span className="truncate">{doc.name}</span>
                    </div>
                  ) : null;
                })}
                {session.docIds.length > 2 && (
                  <div className="text-xs text-muted-foreground">
                    +{session.docIds.length - 2} more
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* New Session Dialog */}
      {showNewSessionDialog && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50">
          <div className="bg-card rounded-lg shadow-xl p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col border border-border">
            <h3 className="text-lg font-semibold text-foreground mb-4">Create New Session</h3>
            <form onSubmit={handleCreateSession} className="flex-1 flex flex-col">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">
                    Session Name
                  </label>
                  <input
                    type="text"
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ML Study Session"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Select Documents (optional)
                  </label>
                  <div className="border border-input rounded-md max-h-60 overflow-y-auto">
                    {documents.map(doc => (
                      <label
                        key={doc.id}
                        className="flex items-center gap-2 p-2 hover:bg-accent cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedDocIds.includes(doc.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedDocIds([...selectedDocIds, doc.id]);
                            } else {
                              setSelectedDocIds(selectedDocIds.filter(id => id !== doc.id));
                            }
                          }}
                          className="rounded border-input"
                        />
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm truncate text-foreground">{doc.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Leave empty for corpus-wide search
                  </p>
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSessionDialog(false);
                    setSelectedDocIds([]);
                    setNewSessionName('');
                  }}
                  className="flex-1 px-4 py-2 border border-input rounded-md hover:bg-accent transition-colors text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
