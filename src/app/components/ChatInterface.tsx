import { useState, useEffect, useRef } from 'react';
import { Message, Citation } from '../types';
import { api } from '../services/api';
import { useStorageSync } from '../hooks/useStorageSync';
import { Send, Loader2, ExternalLink, BookOpen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ChatInterfaceProps {
  sessionId: string;
  onViewDocument?: (docId: string, page?: number) => void;
}

export function ChatInterface({ sessionId, onViewDocument }: ChatInterfaceProps) {
  const syncTrigger = useStorageSync();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
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
      // Add user message
      const userMessage = await api.sendMessage(sessionId, userContent);
      setMessages(prev => [...prev, userMessage]);

      // Stream assistant response
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

      // Save complete assistant message
      const assistantMessage = await api.saveAssistantMessage(
        sessionId,
        fullContent,
        citations
      );

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

  const renderMessage = (message: Message, isStreaming = false) => {
    const content = isStreaming ? streamingContent : message.content;

    return (
      <div
        key={message.id}
        className={`flex gap-3 ${
          message.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
      >
        <div
          className={`max-w-3xl rounded-lg px-4 py-3 ${
            message.role === 'user'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-900'
          }`}
        >
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="mb-2 list-disc pl-4">{children}</ul>,
                ol: ({ children }) => <ol className="mb-2 list-decimal pl-4">{children}</ol>,
                li: ({ children }) => <li className="mb-1">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-gray-200 px-1 py-0.5 rounded text-sm font-mono">
                      {children}
                    </code>
                  ) : (
                    <code className="block bg-gray-200 p-2 rounded text-sm font-mono overflow-x-auto">
                      {children}
                    </code>
                  );
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </div>

          {/* Citations */}
          {!isStreaming && message.citations && message.citations.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="text-xs font-semibold text-gray-600 mb-2">Sources:</div>
              <div className="space-y-2">
                {message.citations.map((citation, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs bg-white rounded p-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => handleCitationClick(citation)}
                  >
                    <div className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-semibold">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate flex items-center gap-1">
                        <BookOpen className="w-3 h-3" />
                        {citation.docName}
                      </div>
                      {(citation.pageStart || citation.lineStart) && (
                        <div className="text-gray-600 mt-0.5">
                          {citation.pageStart
                            ? `Pages ${citation.pageStart}${citation.pageEnd && citation.pageEnd !== citation.pageStart ? `-${citation.pageEnd}` : ''}`
                            : `Lines ${citation.lineStart}${citation.lineEnd && citation.lineEnd !== citation.lineStart ? `-${citation.lineEnd}` : ''}`
                          }
                        </div>
                      )}
                      <div className="text-gray-500 mt-1 line-clamp-2">
                        {citation.excerpt}
                      </div>
                    </div>
                    <ExternalLink className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {isStreaming && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Searching documents...</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500 max-w-md">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium text-gray-700 mb-2">
                Start a conversation
              </h3>
              <p className="text-sm">
                Ask questions about your documents and get answers with citations
                to relevant sources.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => renderMessage(msg))}

        {/* Streaming message */}
        {isLoading && streamingContent && (
          <div className="flex gap-3 justify-start">
            <div className="max-w-3xl rounded-lg px-4 py-3 bg-gray-100 text-gray-900">
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Searching documents...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your documents..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        <div className="mt-2 text-xs text-gray-500 text-center">
          Powered by OpenRouter • Press Enter to send
        </div>
      </div>
    </div>
  );
}
