import { useState, useRef, useEffect } from 'react';
import { MessageHighlight, MessageNote, MessageComment } from '../types';
import { StickyNote, MessageSquare, Highlighter, X, Send } from 'lucide-react';

interface InlineAnnotatableMessageProps {
  content: string;
  messageId: string;
  highlights: MessageHighlight[];
  notes: MessageNote[];
  comments: MessageComment[];
  onAddHighlight: (text: string, color: MessageHighlight['color'], startOffset: number, endOffset: number) => void;
  onAddNote: (content: string, offset: number) => void;
  onAddComment: (content: string, offset: number) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function InlineAnnotatableMessage({
  content,
  messageId,
  highlights,
  notes,
  comments,
  onAddHighlight,
  onAddNote,
  onAddComment,
  onDeleteNote,
  onDeleteComment
}: InlineAnnotatableMessageProps) {
  const [selection, setSelection] = useState<{
    text: string;
    startOffset: number;
    endOffset: number;
    rect: DOMRect;
  } | null>(null);

  const [activePopup, setActivePopup] = useState<{
    type: 'note' | 'comment';
    offset: number;
    rect: DOMRect;
  } | null>(null);

  const [popupContent, setPopupContent] = useState('');
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);

  const contentRef = useRef<HTMLDivElement>(null);

  const handleTextSelection = () => {
    const windowSelection = window.getSelection();
    const text = windowSelection?.toString().trim();

    if (text && text.length > 0 && contentRef.current?.contains(windowSelection.anchorNode)) {
      const range = windowSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      // Calculate offset in the content
      const beforeRange = document.createRange();
      beforeRange.setStart(contentRef.current, 0);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const startOffset = beforeRange.toString().length;
      const endOffset = startOffset + text.length;

      setSelection({
        text,
        startOffset,
        endOffset,
        rect
      });
    } else {
      setSelection(null);
    }
  };

  const handleHighlight = (color: MessageHighlight['color']) => {
    if (selection) {
      onAddHighlight(selection.text, color, selection.startOffset, selection.endOffset);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    }
  };

  const handleOpenNotePopup = () => {
    if (selection) {
      setActivePopup({
        type: 'note',
        offset: selection.startOffset,
        rect: selection.rect
      });
      setPopupContent('');
    }
  };

  const handleOpenCommentPopup = () => {
    if (selection) {
      setActivePopup({
        type: 'comment',
        offset: selection.startOffset,
        rect: selection.rect
      });
      setPopupContent('');
    }
  };

  const handleSavePopup = () => {
    if (activePopup && popupContent.trim()) {
      if (activePopup.type === 'note') {
        onAddNote(popupContent.trim(), activePopup.offset);
      } else {
        onAddComment(popupContent.trim(), activePopup.offset);
      }
      setActivePopup(null);
      setPopupContent('');
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    const target = e.target as Element;
    if (
      !target.closest('.selection-toolbar') &&
      !target.closest('.annotation-popup') &&
      !target.closest('.note-icon') &&
      !target.closest('.comment-icon')
    ) {
      setSelection(null);
      setActivePopup(null);
      setActiveNoteId(null);
      setActiveCommentId(null);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Render content with highlights and annotation markers
  const renderAnnotatedContent = () => {
    if (!content) return null;

    // Build segments with all annotations
    const segments: Array<{
      start: number;
      end: number;
      type: 'text' | 'highlight' | 'note' | 'comment';
      data?: any;
    }> = [];

    // Add highlights
    highlights.forEach(hl => {
      segments.push({
        start: hl.startOffset,
        end: hl.endOffset,
        type: 'highlight',
        data: hl
      });
    });

    // Add note markers at their positions
    notes.forEach(note => {
      segments.push({
        start: note.offset || 0,
        end: note.offset || 0,
        type: 'note',
        data: note
      });
    });

    // Add comment markers
    comments.forEach(comment => {
      segments.push({
        start: comment.offset || 0,
        end: comment.offset || 0,
        type: 'comment',
        data: comment
      });
    });

    // Sort by position
    segments.sort((a, b) => a.start - b.start);

    const elements: JSX.Element[] = [];
    let currentPos = 0;

    segments.forEach((segment, idx) => {
      // Add text before this segment
      if (segment.start > currentPos) {
        elements.push(
          <span key={`text-${idx}`}>
            {content.substring(currentPos, segment.start)}
          </span>
        );
      }

      if (segment.type === 'highlight') {
        const hl = segment.data as MessageHighlight;
        const colorClass =
          hl.color === 'yellow' ? 'bg-yellow-200 dark:bg-yellow-900/40' :
          hl.color === 'green' ? 'bg-green-200 dark:bg-green-900/40' :
          hl.color === 'blue' ? 'bg-blue-200 dark:bg-blue-900/40' :
          hl.color === 'pink' ? 'bg-pink-200 dark:bg-pink-900/40' :
          'bg-purple-200 dark:bg-purple-900/40';

        elements.push(
          <mark key={`hl-${hl.id}`} className={`${colorClass} px-0.5 rounded-sm`}>
            {content.substring(segment.start, segment.end)}
          </mark>
        );
        currentPos = segment.end;
      } else if (segment.type === 'note') {
        const note = segment.data as MessageNote;
        elements.push(
          <span key={`note-${note.id}`} className="relative inline-block note-icon">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveNoteId(activeNoteId === note.id ? null : note.id);
              }}
              className="inline-flex items-center justify-center w-4 h-4 ml-0.5 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-sm cursor-pointer align-middle"
              title="Note"
            >
              <StickyNote className="w-3 h-3" />
            </button>
            {activeNoteId === note.id && (
              <div className="annotation-popup absolute left-0 top-6 z-50 w-72 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-xl">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-400">
                    <StickyNote className="w-3 h-3" />
                    Note
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteNote(note.id);
                      setActiveNoteId(null);
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
          </span>
        );
      } else if (segment.type === 'comment') {
        const comment = segment.data as MessageComment;
        elements.push(
          <span key={`comment-${comment.id}`} className="relative inline-block comment-icon">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveCommentId(activeCommentId === comment.id ? null : comment.id);
              }}
              className="inline-flex items-center justify-center w-4 h-4 ml-0.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-sm cursor-pointer align-middle"
              title="Comment"
            >
              <MessageSquare className="w-3 h-3" />
            </button>
            {activeCommentId === comment.id && (
              <div className="annotation-popup absolute left-0 top-6 z-50 w-72 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-xl">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-400">
                    <MessageSquare className="w-3 h-3" />
                    Comment
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteComment(comment.id);
                      setActiveCommentId(null);
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
          </span>
        );
      }
    });

    // Add remaining text
    if (currentPos < content.length) {
      elements.push(
        <span key="text-end">
          {content.substring(currentPos)}
        </span>
      );
    }

    return elements;
  };

  const colors: Array<{ color: MessageHighlight['color']; emoji: string }> = [
    { color: 'yellow', emoji: '🟡' },
    { color: 'green', emoji: '🟢' },
    { color: 'blue', emoji: '🔵' },
    { color: 'pink', emoji: '🔴' },
    { color: 'purple', emoji: '🟣' }
  ];

  return (
    <div className="relative">
      {/* Selectable content */}
      <div
        ref={contentRef}
        onMouseUp={handleTextSelection}
        className="select-text leading-relaxed"
      >
        {renderAnnotatedContent()}
      </div>

      {/* Selection toolbar */}
      {selection && !activePopup && (
        <div
          className="selection-toolbar fixed z-50 flex items-center gap-1 p-2 bg-card border border-border rounded-lg shadow-xl"
          style={{
            left: `${selection.rect.left + selection.rect.width / 2}px`,
            top: `${selection.rect.top - 10}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {/* Highlight colors */}
          <div className="flex items-center gap-0.5 pr-2 border-r border-border">
            {colors.map(({ color, emoji }) => (
              <button
                key={color}
                onClick={() => handleHighlight(color)}
                className="w-7 h-7 flex items-center justify-center hover:bg-accent rounded transition-colors"
                title={`Highlight ${color}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Note button */}
          <button
            onClick={handleOpenNotePopup}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded transition-colors text-yellow-700 dark:text-yellow-400"
            title="Add note"
          >
            <StickyNote className="w-3.5 h-3.5" />
            Note
          </button>

          {/* Comment button */}
          <button
            onClick={handleOpenCommentPopup}
            className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors text-blue-700 dark:text-blue-400"
            title="Add comment"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Comment
          </button>
        </div>
      )}

      {/* Note/Comment input popup */}
      {activePopup && (
        <div
          className="annotation-popup fixed z-50 w-80 p-3 bg-card border border-border rounded-lg shadow-xl"
          style={{
            left: `${activePopup.rect.left}px`,
            top: `${activePopup.rect.bottom + 10}px`
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            {activePopup.type === 'note' ? (
              <>
                <StickyNote className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                <span className="text-sm font-medium text-foreground">Add Note</span>
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-foreground">Add Comment</span>
              </>
            )}
          </div>

          <textarea
            value={popupContent}
            onChange={(e) => setPopupContent(e.target.value)}
            placeholder={`Write your ${activePopup.type}...`}
            className="w-full px-3 py-2 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSavePopup();
              }
              if (e.key === 'Escape') {
                setActivePopup(null);
                setPopupContent('');
              }
            }}
          />

          <div className="flex items-center justify-end gap-2 mt-2">
            <button
              onClick={() => {
                setActivePopup(null);
                setPopupContent('');
              }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSavePopup}
              disabled={!popupContent.trim()}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs text-white rounded transition-colors ${
                activePopup.type === 'note'
                  ? 'bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400'
                  : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
              } disabled:cursor-not-allowed`}
            >
              <Send className="w-3 h-3" />
              Save
            </button>
          </div>

          <div className="text-xs text-muted-foreground mt-2">
            Press {navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Enter to save
          </div>
        </div>
      )}
    </div>
  );
}
