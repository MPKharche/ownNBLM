import { useState, useEffect, useRef } from 'react';
import { Message, Citation, MessageHighlight } from '../types';
import { api } from '../services/api';
import { useStorageSync } from '../hooks/useStorageSync';
import {
  Send,
  Loader2,
  ExternalLink,
  BookOpen,
  Copy,
  Check,
  StickyNote,
  MessageSquare,
  X
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ImmersiveChatInterfaceProps {
  sessionId: string;
  onViewDocument?: (docId: string, page?: number) => void;
}

export function ImmersiveChatInterface({ sessionId, onViewDocument }: ImmersiveChatInterfaceProps) {
  const syncTrigger = useStorageSync();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [selectionPosition, setSelectionPosition] = useState<{ x: number; y: number } | null>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [annotationContent, setAnnotationContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMessages();
  }, [sessionId, syncTrigger]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  const loadMessages = async () => {
    const data = await api.getMessages(sessionId);
    setMessages(data);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userContent = input.trim();
    setInput('');
    setIsLoading(true);
    setStreamingContent('');

    try {
      const userMessage = await api.sendMessage(sessionId, userContent);
      setMessages(prev => [...prev, userMessage]);

      let fullContent = '';
      let citations: Citation[] | undefined;

      for await (const chunk of api.streamAssistantResponse(sessionId, userContent)) {
        if (chunk.content) {
          fullContent += chunk.content;
          setStreamingContent(fullContent);
        }
        if (chunk.citations) {
          citations = chunk.citations;
        }
      }

      const assistantMessage = await api.saveAssistantMessage(sessionId, fullContent, citations);
      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCitationClick = (citation: Citation) => {
    if (onViewDocument) {
      onViewDocument(citation.docId, citation.pageStart);
    }
  };

  const copyMessageToClipboard = (message: Message) => {
    let text = message.content;

    if (message.citations && message.citations.length > 0) {
      text += '\n\nSources:\n';
      message.citations.forEach((citation, idx) => {
        text += `${idx + 1}. ${citation.docName}`;
        if (citation.pageStart) {
          text += ` (Page ${citation.pageStart})`;
        }
        text += '\n';
      });
    }

    navigator.clipboard.writeText(text);
    setCopiedMessageId(message.id);
    setTimeout(() => setCopiedMessageId(null), 2000);
  };

  const handleAddHighlight = async (messageId: string, text: string, color: MessageHighlight['color'], startOffset: number, endOffset: number) => {
    try {
      await api.addHighlight(sessionId, messageId, text, color, startOffset, endOffset);
      await loadMessages();
    } catch (error) {
      console.error('Error adding highlight:', error);
    }
  };

  const handleAddNote = async (messageId: string, content: string, offset: number) => {
    try {
      await api.addNote(sessionId, messageId, content, offset);
      await loadMessages();
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleAddComment = async (messageId: string, content: string, offset: number) => {
    try {
      await api.addComment(sessionId, messageId, content, offset);
      await loadMessages();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleDeleteNote = async (messageId: string, noteId: string) => {
    try {
      await api.deleteNote(sessionId, messageId, noteId);
      await loadMessages();
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  const handleDeleteComment = async (messageId: string, commentId: string) => {
    try {
      await api.deleteComment(sessionId, messageId, commentId);
      await loadMessages();
      setActiveCommentId(null);
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleTextSelection = (messageId: string) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      setSelectedMessageId(messageId);
      setSelectedText(text);
      setSelectionPosition({
        x: rect.left + rect.width / 2,
        y: rect.top - 10
      });
    } else {
      setSelectedMessageId(null);
      setSelectedText('');
      setSelectionPosition(null);
    }
  };

  const handleHighlightClick = async (color: MessageHighlight['color']) => {
    if (selectedMessageId && selectedText) {
      await handleAddHighlight(selectedMessageId, selectedText, color, 0, selectedText.length);
      window.getSelection()?.removeAllRanges();
      setSelectedMessageId(null);
      setSelectedText('');
      setSelectionPosition(null);
    }
  };

  const handleSaveAnnotation = async (type: 'note' | 'comment') => {
    if (selectedMessageId && annotationContent.trim()) {
      if (type === 'note') {
        await handleAddNote(selectedMessageId, annotationContent.trim(), 0);
      } else {
        await handleAddComment(selectedMessageId, annotationContent.trim(), 0);
      }
      setAnnotationContent('');
      setShowNoteInput(false);
      setShowCommentInput(false);
      window.getSelection()?.removeAllRanges();
      setSelectedMessageId(null);
      setSelectedText('');
      setSelectionPosition(null);
    }
  };

  useEffect(() => {
    const handleClickOutside = () => {
      setSelectionPosition(null);
      setSelectedMessageId(null);
      setSelectedText('');
      setShowNoteInput(false);
      setShowCommentInput(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const renderMessage = (message: Message, isStreaming = false) => {
    const content = isStreaming ? streamingContent : message.content;

    return (
      <div
        key={message.id}
        className={`group animate-message ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}`}
      >
        <div className={`max-w-4xl w-full ${message.role === 'user' ? 'flex justify-end' : ''}`}>
          <div
            className={`relative rounded-lg ${
              message.role === 'user'
                ? 'bg-blue-600 dark:bg-blue-700 text-white px-4 py-3 max-w-2xl'
                : 'bg-card text-foreground px-4 py-3 w-full border border-border'
            }`}
          >
            {/* Message Content */}
            <div
              className="prose prose-sm dark:prose-invert max-w-none select-text"
              onMouseUp={() => message.role === 'assistant' && !isStreaming && handleTextSelection(message.id)}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 list-disc pl-4 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-decimal pl-4 space-y-1">{children}</ol>,
                  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
                        {children}
                      </code>
                    ) : (
                      <code className="block bg-muted p-2 rounded text-sm font-mono overflow-x-auto my-2">
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>

            {/* Highlights Display */}
            {!isStreaming && message.role === 'assistant' && message.highlights && message.highlights.length > 0 && (
              <div className="mt-2 pt-2 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-1.5">Highlights:</div>
                <div className="flex flex-wrap gap-1.5">
                  {message.highlights.map(hl => {
                    const bgColor =
                      hl.color === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200' :
                      hl.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200' :
                      hl.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200' :
                      hl.color === 'pink' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-800 dark:text-pink-200' :
                      'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200';

                    return (
                      <div key={hl.id} className={`text-xs px-2 py-1 rounded ${bgColor}`}>
                        "{hl.text}"
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Annotation Icons (Notes & Comments) */}
            {!isStreaming && message.role === 'assistant' && (message.notes?.length || message.comments?.length) && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {message.notes && message.notes.map(note => (
                  <div key={note.id} className="relative inline-block">
                    <button
                      onClick={() => setActiveNoteId(activeNoteId === note.id ? null : note.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded transition-colors"
                      title="View note"
                    >
                      <StickyNote className="w-3 h-3" />
                      Note
                    </button>
                    {activeNoteId === note.id && (
                      <div className="absolute left-0 top-8 z-50 w-72 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-xl">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400 font-medium">
                            <StickyNote className="w-3 h-3" />
                            Note
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteNote(message.id, note.id);
                            }}
                            className="p-1 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-sm text-foreground leading-relaxed">{note.content}</div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(note.createdAt).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {message.comments && message.comments.map(comment => (
                  <div key={comment.id} className="relative inline-block">
                    <button
                      onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
                      title="View comment"
                    >
                      <MessageSquare className="w-3 h-3" />
                      Comment
                    </button>
                    {activeCommentId === comment.id && (
                      <div className="absolute left-0 top-8 z-50 w-72 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-xl">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400 font-medium">
                            <MessageSquare className="w-3 h-3" />
                            Comment
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteComment(message.id, comment.id);
                            }}
                            className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-sm text-foreground leading-relaxed">{comment.content}</div>
                        <div className="text-xs text-muted-foreground mt-2">
                          {new Date(comment.createdAt).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Citations */}
            {!isStreaming && message.citations && message.citations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border">
                <div className="text-xs font-medium text-muted-foreground mb-2">Sources:</div>
                <div className="space-y-2">
                  {message.citations.map((citation, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2 text-xs bg-accent rounded p-2 cursor-pointer hover:bg-accent/80 transition-colors border border-border"
                      onClick={() => handleCitationClick(citation)}
                    >
                      <div className="flex-shrink-0 w-5 h-5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full flex items-center justify-center text-[10px] font-semibold">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-foreground truncate flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {citation.docName}
                        </div>
                        {(citation.pageStart || citation.lineStart) && (
                          <div className="text-muted-foreground mt-0.5">
                            {citation.pageStart
                              ? `Pages ${citation.pageStart}${citation.pageEnd && citation.pageEnd !== citation.pageStart ? `-${citation.pageEnd}` : ''}`
                              : `Lines ${citation.lineStart}${citation.lineEnd && citation.lineEnd !== citation.lineStart ? `-${citation.lineEnd}` : ''}`
                            }
                          </div>
                        )}
                        <div className="text-muted-foreground mt-1 line-clamp-2">
                          {citation.excerpt}
                        </div>
                      </div>
                      <ExternalLink className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Streaming Indicator */}
            {isStreaming && (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="animate-pulse">Generating response...</span>
              </div>
            )}

            {/* Action Buttons */}
            {!isStreaming && message.role === 'assistant' && (
              <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                <button
                  onClick={() => copyMessageToClipboard(message)}
                  className="p-1.5 bg-card border border-border rounded-md hover:bg-accent transition-colors shadow-sm"
                  title="Copy"
                >
                  {copiedMessageId === message.id ? (
                    <Check className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Messages - Tight Spacing */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground max-w-md">
              <BookOpen className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
              <h3 className="text-base font-medium text-foreground mb-1">
                Start Learning
              </h3>
              <p className="text-sm">
                Ask questions and get answers with citations to your documents.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => renderMessage(msg))}

        {isLoading && streamingContent && renderMessage({
          id: 'streaming',
          role: 'assistant',
          content: streamingContent,
          timestamp: new Date().toISOString(),
          isStreaming: true
        }, true)}

        <div ref={messagesEndRef} />
      </div>

      {/* Selection Toolbar */}
      {selectionPosition && selectedMessageId && !showNoteInput && !showCommentInput && (
        <div
          className="fixed z-50 flex items-center gap-1 p-2 bg-card border border-border rounded-lg shadow-xl"
          style={{
            left: `${selectionPosition.x}px`,
            top: `${selectionPosition.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Highlight colors */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-border">
            {[
              { color: 'yellow' as const, emoji: '🟡' },
              { color: 'green' as const, emoji: '🟢' },
              { color: 'blue' as const, emoji: '🔵' },
              { color: 'pink' as const, emoji: '🔴' },
              { color: 'purple' as const, emoji: '🟣' }
            ].map(({ color, emoji }) => (
              <button
                key={color}
                onClick={() => handleHighlightClick(color)}
                className="w-7 h-7 flex items-center justify-center hover:bg-accent rounded transition-colors"
                title={`Highlight ${color}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Note button */}
          <button
            onClick={() => setShowNoteInput(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded transition-colors text-yellow-700 dark:text-yellow-400"
          >
            <StickyNote className="w-3.5 h-3.5" />
            Note
          </button>

          {/* Comment button */}
          <button
            onClick={() => setShowCommentInput(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors text-blue-700 dark:text-blue-400"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Comment
          </button>
        </div>
      )}

      {/* Note Input Popup */}
      {showNoteInput && selectionPosition && (
        <div
          className="fixed z-50 w-80 p-3 bg-card border border-border rounded-lg shadow-xl"
          style={{
            left: `${selectionPosition.x}px`,
            top: `${selectionPosition.y + 20}px`,
            transform: 'translateX(-50%)'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            <span className="text-sm font-medium text-foreground">Add Note</span>
          </div>
          <textarea
            value={annotationContent}
            onChange={(e) => setAnnotationContent(e.target.value)}
            placeholder="Write your note..."
            className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSaveAnnotation('note');
              }
              if (e.key === 'Escape') {
                setShowNoteInput(false);
                setAnnotationContent('');
              }
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">
              {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to save
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNoteInput(false);
                  setAnnotationContent('');
                }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveAnnotation('note')}
                disabled={!annotationContent.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 text-white rounded transition-colors disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comment Input Popup */}
      {showCommentInput && selectionPosition && (
        <div
          className="fixed z-50 w-80 p-3 bg-card border border-border rounded-lg shadow-xl"
          style={{
            left: `${selectionPosition.x}px`,
            top: `${selectionPosition.y + 20}px`,
            transform: 'translateX(-50%)'
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-foreground">Add Comment</span>
          </div>
          <textarea
            value={annotationContent}
            onChange={(e) => setAnnotationContent(e.target.value)}
            placeholder="Write your comment..."
            className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSaveAnnotation('comment');
              }
              if (e.key === 'Escape') {
                setShowCommentInput(false);
                setAnnotationContent('');
              }
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-muted-foreground">
              {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to save
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowCommentInput(false);
                  setAnnotationContent('');
                }}
                className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSaveAnnotation('comment')}
                disabled={!annotationContent.trim()}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded transition-colors disabled:cursor-not-allowed"
              >
                <Send className="w-3 h-3" />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compact Input */}
      <div className="flex-shrink-0 border-t border-border bg-background p-2">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            className="flex-1 px-3 py-2 text-sm border border-input bg-background rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-md hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
