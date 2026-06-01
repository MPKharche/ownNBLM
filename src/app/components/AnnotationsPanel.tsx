import { useState, useEffect } from 'react';
import { Message, MessageNote, MessageComment, MessageHighlight } from '../types';
import { api } from '../services/api';
import { useStorageSync } from '../hooks/useStorageSync';
import {
  StickyNote,
  MessageSquare,
  Highlighter,
  Map,
  FileText
} from 'lucide-react';
import { MindMapView } from './MindMapView';

interface AnnotationsPanelProps {
  sessionId: string;
}

export function AnnotationsPanel({ sessionId }: AnnotationsPanelProps) {
  const syncTrigger = useStorageSync();
  const [activeTab, setActiveTab] = useState<'notes' | 'highlights' | 'comments' | 'mindmap'>('notes');
  const [messages, setMessages] = useState<Message[]>([]);
  const [allNotes, setAllNotes] = useState<Array<MessageNote & { messageId: string; messageContent: string }>>([]);
  const [allHighlights, setAllHighlights] = useState<Array<MessageHighlight & { messageId: string }>>([]);
  const [allComments, setAllComments] = useState<Array<MessageComment & { messageId: string; messageContent: string }>>([]);

  useEffect(() => {
    loadMessages();
  }, [sessionId, syncTrigger]);

  useEffect(() => {
    aggregateAnnotations();
  }, [messages]);

  const loadMessages = async () => {
    const data = await api.getMessages(sessionId);
    setMessages(data);
  };

  const aggregateAnnotations = () => {
    const notes: typeof allNotes = [];
    const highlights: typeof allHighlights = [];
    const comments: typeof allComments = [];

    messages.forEach(msg => {
      const preview = msg.content.substring(0, 80) + (msg.content.length > 80 ? '...' : '');

      msg.notes?.forEach(note => {
        notes.push({
          ...note,
          messageId: msg.id,
          messageContent: preview
        });
      });

      msg.highlights?.forEach(highlight => {
        highlights.push({
          ...highlight,
          messageId: msg.id
        });
      });

      msg.comments?.forEach(comment => {
        comments.push({
          ...comment,
          messageId: msg.id,
          messageContent: preview
        });
      });
    });

    setAllNotes(notes);
    setAllHighlights(highlights);
    setAllComments(comments);
  };

  const exportAllAnnotations = () => {
    let markdown = `# Annotations Export\n\n`;
    markdown += `**Session:** ${sessionId}\n`;
    markdown += `**Exported:** ${new Date().toLocaleString()}\n\n`;
    markdown += `---\n\n`;

    // Notes
    if (allNotes.length > 0) {
      markdown += `## 📝 Notes (${allNotes.length})\n\n`;
      allNotes.forEach((note, idx) => {
        markdown += `### ${idx + 1}. ${note.content}\n`;
        markdown += `**From message:** "${note.messageContent}"\n`;
        markdown += `**Created:** ${new Date(note.createdAt).toLocaleString()}\n\n`;
      });
      markdown += `---\n\n`;
    }

    // Highlights
    if (allHighlights.length > 0) {
      markdown += `## ✨ Highlights (${allHighlights.length})\n\n`;
      allHighlights.forEach((highlight, idx) => {
        markdown += `${idx + 1}. **${highlight.color.toUpperCase()}:** "${highlight.text}"\n`;
        markdown += `   _Created: ${new Date(highlight.createdAt).toLocaleString()}_\n\n`;
      });
      markdown += `---\n\n`;
    }

    // Comments
    if (allComments.length > 0) {
      markdown += `## 💬 Comments (${allComments.length})\n\n`;
      allComments.forEach((comment, idx) => {
        markdown += `### ${idx + 1}. ${comment.content}\n`;
        markdown += `**On message:** "${comment.messageContent}"\n`;
        markdown += `**Created:** ${new Date(comment.createdAt).toLocaleString()}\n\n`;
      });
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${sessionId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Tabs */}
      <div className="flex border-b border-border bg-card">
        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 py-2 px-3 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'notes'
              ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <StickyNote className="w-3.5 h-3.5" />
          Notes
          {allNotes.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded-full text-[10px]">
              {allNotes.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('highlights')}
          className={`flex-1 py-2 px-3 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'highlights'
              ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Highlighter className="w-3.5 h-3.5" />
          Highlights
          {allHighlights.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-full text-[10px]">
              {allHighlights.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('comments')}
          className={`flex-1 py-2 px-3 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'comments'
              ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Comments
          {allComments.length > 0 && (
            <span className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full text-[10px]">
              {allComments.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('mindmap')}
          className={`flex-1 py-2 px-3 text-xs font-medium transition-colors flex items-center justify-center gap-1 ${
            activeTab === 'mindmap'
              ? 'border-b-2 border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Map className="w-3.5 h-3.5" />
          Map
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'notes' && (
          <div className="space-y-2">
            {allNotes.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                <StickyNote className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
                <p>No notes yet</p>
                <p className="text-xs mt-1">Add notes to messages to capture insights</p>
              </div>
            ) : (
              allNotes.map(note => (
                <div key={note.id} className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded p-2">
                  <div className="text-sm text-foreground mb-1">{note.content}</div>
                  <div className="text-xs text-muted-foreground">
                    From: "{note.messageContent}"
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(note.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'highlights' && (
          <div className="space-y-2">
            {allHighlights.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                <Highlighter className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
                <p>No highlights yet</p>
                <p className="text-xs mt-1">Highlight important text in messages</p>
              </div>
            ) : (
              allHighlights.map(highlight => (
                <div
                  key={highlight.id}
                  className={`p-2 rounded ${
                    highlight.color === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                    highlight.color === 'green' ? 'bg-green-100 dark:bg-green-900/30' :
                    highlight.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30' :
                    highlight.color === 'pink' ? 'bg-pink-100 dark:bg-pink-900/30' :
                    'bg-purple-100 dark:bg-purple-900/30'
                  }`}
                >
                  <div className="text-sm text-foreground">"{highlight.text}"</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(highlight.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'comments' && (
          <div className="space-y-2">
            {allComments.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 text-muted-foreground/50" />
                <p>No comments yet</p>
                <p className="text-xs mt-1">Add comments to discuss messages</p>
              </div>
            ) : (
              allComments.map(comment => (
                <div key={comment.id} className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-2">
                  <div className="text-sm text-foreground mb-1">{comment.content}</div>
                  <div className="text-xs text-muted-foreground">
                    On: "{comment.messageContent}"
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(comment.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'mindmap' && (
          <MindMapView sessionId={sessionId} messages={messages} />
        )}
      </div>

      {/* Export Button */}
      <div className="p-2 border-t border-border bg-card">
        <button
          onClick={exportAllAnnotations}
          className="w-full py-2 px-3 bg-blue-600 dark:bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Export All
        </button>
      </div>
    </div>
  );
}
