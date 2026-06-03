import { useState, useEffect } from 'react';
import { Session, Source } from '../types';
import { api } from '../services/api';
import { useStorageSync } from '../hooks/useStorageSync';
import {
  MessageSquare,
  Plus,
  Trash2,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  Search
} from 'lucide-react';

interface SessionsMenuProps {
  currentSessionId: string;
  onSessionSelect: (sessionId: string) => void;
}

export function SessionsMenu({ currentSessionId, onSessionSelect }: SessionsMenuProps) {
  const syncTrigger = useStorageSync();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set(['all']));
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');

  useEffect(() => {
    loadData();
  }, [syncTrigger]);

  const loadData = async () => {
    const [sessionsData, sourcesData] = await Promise.all([
      api.getSessions(),
      api.getSources()
    ]);
    setSessions(sessionsData);
    setSources(sourcesData);
  };

  const toggleSourceExpand = (sourceId: string) => {
    const newExpanded = new Set(expandedSources);
    if (newExpanded.has(sourceId)) {
      newExpanded.delete(sourceId);
    } else {
      newExpanded.add(sourceId);
    }
    setExpandedSources(newExpanded);
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) return;

    try {
      const newSession = await api.createSession(newSessionName.trim(), []);
      setSessions(prev => [...prev, newSession]);
      setNewSessionName('');
      setIsCreatingSession(false);
      onSessionSelect(newSession.id);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session? This action cannot be undone.')) return;

    try {
      await api.deleteSession(sessionId);
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      if (currentSessionId === sessionId && sessions.length > 1) {
        const nextSession = sessions.find(s => s.id !== sessionId);
        if (nextSession) onSessionSelect(nextSession.id);
      }
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const getSourceSessions = (sourceId?: string) => {
    return sessions.filter(session => {
      if (sourceId === 'all') return session.mode === 'corpus';
      // Filter sessions that include documents from this source
      return session.docIds.length > 0; // Simplified - in real app, check doc sourceIds
    });
  };

  const filteredSessions = sessions.filter(session =>
    session.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="h-full flex flex-col bg-card border-r border-border">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-primary" />
            Sessions
          </h2>
          <button
            onClick={() => setIsCreatingSession(true)}
            className="p-1.5 hover:bg-accent rounded-md transition-colors"
            title="New session"
          >
            <Plus className="w-4 h-4 text-primary" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Create Session Form */}
      {isCreatingSession && (
        <div className="p-3 border-b border-border bg-accent/50 animate-slide-in-bottom">
          <div className="space-y-2">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Session name..."
              className="w-full px-3 py-2 text-sm bg-background border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateSession();
                if (e.key === 'Escape') {
                  setIsCreatingSession(false);
                  setNewSessionName('');
                }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateSession}
                disabled={!newSessionName.trim()}
                className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setIsCreatingSession(false);
                  setNewSessionName('');
                }}
                className="flex-1 px-3 py-1.5 text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sessions List */}
      <div className="flex-1 overflow-y-auto">
        {/* All Sources (Corpus) */}
        <div className="border-b border-border">
          <button
            onClick={() => toggleSourceExpand('all')}
            className="w-full px-4 py-2 flex items-center gap-2 hover:bg-accent transition-colors text-sm font-medium"
          >
            {expandedSources.has('all') ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            )}
            <FolderOpen className="w-4 h-4 text-primary" />
            <span className="flex-1 text-left">All Sources</span>
            <span className="text-xs text-muted-foreground">
              {getSourceSessions('all').length}
            </span>
          </button>

          {expandedSources.has('all') && (
            <div className="pb-2">
              {getSourceSessions('all')
                .filter(s => searchQuery === '' || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                .map(session => (
                  <div key={session.id} className="animate-slide-in-left">
                    <button
                      onClick={() => onSessionSelect(session.id)}
                      className={`w-full px-4 py-2.5 flex items-start gap-3 hover:bg-accent transition-all group relative ${
                        currentSessionId === session.id
                          ? 'bg-primary/10 border-l-2 border-primary'
                          : 'border-l-2 border-transparent'
                      }`}
                    >
                      <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                        currentSessionId === session.id ? 'text-primary' : 'text-muted-foreground'
                      }`} />
                      <div className="flex-1 text-left overflow-hidden">
                        <div className={`text-sm font-medium truncate ${
                          currentSessionId === session.id ? 'text-primary' : 'text-foreground'
                        }`}>
                          {session.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatDate(session.lastMessageAt)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            • {session.messageCount} msgs
                          </span>
                        </div>
                      </div>
                      {session.id !== 'session-corpus' && (
                        <button
                          onClick={(e) => handleDeleteSession(session.id, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all"
                          title="Delete session"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </button>
                      )}
                    </button>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* Individual Sources */}
        {sources.map(source => (
          <div key={source.id} className="border-b border-border">
            <button
              onClick={() => toggleSourceExpand(source.id)}
              className="w-full px-4 py-2 flex items-center gap-2 hover:bg-accent transition-colors text-sm font-medium"
            >
              {expandedSources.has(source.id) ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <FolderOpen className="w-4 h-4 text-chart-2" />
              <span className="flex-1 text-left truncate">{source.label}</span>
              <span className="text-xs text-muted-foreground">
                {getSourceSessions(source.id).length}
              </span>
            </button>

            {expandedSources.has(source.id) && (
              <div className="pb-2">
                {getSourceSessions(source.id).length === 0 ? (
                  <div className="px-4 py-3 text-xs text-muted-foreground italic">
                    No sessions for this source
                  </div>
                ) : (
                  getSourceSessions(source.id)
                    .filter(s => searchQuery === '' || s.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    .map(session => (
                      <div key={session.id} className="animate-slide-in-left">
                        <button
                          onClick={() => onSessionSelect(session.id)}
                          className={`w-full px-4 py-2.5 flex items-start gap-3 hover:bg-accent transition-all group relative ${
                            currentSessionId === session.id
                              ? 'bg-primary/10 border-l-2 border-primary'
                              : 'border-l-2 border-transparent'
                          }`}
                        >
                          <MessageSquare className={`w-4 h-4 mt-0.5 flex-shrink-0 ${
                            currentSessionId === session.id ? 'text-primary' : 'text-muted-foreground'
                          }`} />
                          <div className="flex-1 text-left overflow-hidden">
                            <div className={`text-sm font-medium truncate ${
                              currentSessionId === session.id ? 'text-primary' : 'text-foreground'
                            }`}>
                              {session.name}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <Clock className="w-3 h-3 text-muted-foreground" />
                              <span className="text-xs text-muted-foreground">
                                {formatDate(session.lastMessageAt)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                • {session.messageCount} msgs
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => handleDeleteSession(session.id, e)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded transition-all"
                            title="Delete session"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </button>
                        </button>
                      </div>
                    ))
                )}
              </div>
            )}
          </div>
        ))}

        {filteredSessions.length === 0 && searchQuery && (
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No sessions found</p>
          </div>
        )}
      </div>
    </div>
  );
}
