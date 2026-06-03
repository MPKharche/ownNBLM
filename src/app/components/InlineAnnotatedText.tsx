import { useState, useRef, useEffect } from 'react';
import { MessageHighlight, MessageNote, MessageComment } from '../types';
import { StickyNote, MessageSquare, X } from 'lucide-react';

interface InlineAnnotatedTextProps {
  content: string;
  highlights: MessageHighlight[];
  notes: MessageNote[];
  comments: MessageComment[];
  onAddHighlight: (text: string, color: MessageHighlight['color']) => void;
  onDeleteNote?: (noteId: string) => void;
  onDeleteComment?: (commentId: string) => void;
}

export function InlineAnnotatedText({
  content,
  highlights,
  notes,
  comments,
  onAddHighlight,
  onDeleteNote,
  onDeleteComment
}: InlineAnnotatedTextProps) {
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const [colorPickerPosition, setColorPickerPosition] = useState<{ x: number; y: number } | null>(null);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();

    if (text && text.length > 0 && contentRef.current) {
      const range = selection?.getRangeAt(0);
      if (range) {
        const rect = range.getBoundingClientRect();
        setSelectedText(text);
        setColorPickerPosition({
          x: rect.left + rect.width / 2,
          y: rect.top - 10
        });

        // Calculate text offsets in the content
        const start = content.indexOf(text);
        if (start !== -1) {
          setSelectionRange({ start, end: start + text.length });
        }
      }
    }
  };

  const handleColorSelect = (color: MessageHighlight['color']) => {
    if (selectedText && selectionRange) {
      onAddHighlight(selectedText, color);
      setSelectedText('');
      setColorPickerPosition(null);
      setSelectionRange(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const handleClickOutside = (e: MouseEvent) => {
    if (colorPickerPosition && !(e.target as Element).closest('.color-picker')) {
      setColorPickerPosition(null);
      setSelectedText('');
      setSelectionRange(null);
    }
    if (activeNoteId && !(e.target as Element).closest('.note-popup')) {
      setActiveNoteId(null);
    }
    if (activeCommentId && !(e.target as Element).closest('.comment-popup')) {
      setActiveCommentId(null);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [colorPickerPosition, activeNoteId, activeCommentId]);

  // Render content with inline highlights and annotation markers
  const renderAnnotatedContent = () => {
    if (!content) return null;

    // Build a list of all text ranges that need special rendering
    const segments: Array<{
      start: number;
      end: number;
      type: 'highlight' | 'note' | 'comment';
      data: any;
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

    // For notes and comments, we'll insert markers at the beginning of paragraphs
    // In a real implementation, you'd track exact positions
    notes.forEach((note, idx) => {
      segments.push({
        start: idx * 100, // Simplified positioning
        end: idx * 100,
        type: 'note',
        data: note
      });
    });

    comments.forEach((comment, idx) => {
      segments.push({
        start: idx * 150, // Simplified positioning
        end: idx * 150,
        type: 'comment',
        data: comment
      });
    });

    // Sort segments by start position
    segments.sort((a, b) => a.start - b.start);

    // Build the rendered output
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

      // Add the segment
      if (segment.type === 'highlight') {
        const hl = segment.data as MessageHighlight;
        const bgColor =
          hl.color === 'yellow' ? 'bg-yellow-200 dark:bg-yellow-900/50' :
          hl.color === 'green' ? 'bg-green-200 dark:bg-green-900/50' :
          hl.color === 'blue' ? 'bg-blue-200 dark:bg-blue-900/50' :
          hl.color === 'pink' ? 'bg-pink-200 dark:bg-pink-900/50' :
          'bg-purple-200 dark:bg-purple-900/50';

        elements.push(
          <mark
            key={`hl-${hl.id}`}
            className={`${bgColor} px-0.5 rounded`}
          >
            {content.substring(segment.start, segment.end)}
          </mark>
        );
        currentPos = segment.end;
      } else if (segment.type === 'note') {
        const note = segment.data as MessageNote;
        elements.push(
          <span key={`note-${note.id}`} className="relative inline-block">
            <button
              onClick={() => setActiveNoteId(activeNoteId === note.id ? null : note.id)}
              className="inline-flex items-center justify-center w-4 h-4 ml-1 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded cursor-pointer"
              title="Note"
            >
              <StickyNote className="w-3 h-3" />
            </button>
            {activeNoteId === note.id && (
              <div className="note-popup absolute left-0 top-6 z-50 w-64 p-3 bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg shadow-lg">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <StickyNote className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <button
                    onClick={() => {
                      if (onDeleteNote) onDeleteNote(note.id);
                      setActiveNoteId(null);
                    }}
                    className="p-1 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-sm text-foreground">{note.content}</div>
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
          <span key={`comment-${comment.id}`} className="relative inline-block">
            <button
              onClick={() => setActiveCommentId(activeCommentId === comment.id ? null : comment.id)}
              className="inline-flex items-center justify-center w-4 h-4 ml-1 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded cursor-pointer"
              title="Comment"
            >
              <MessageSquare className="w-3 h-3" />
            </button>
            {activeCommentId === comment.id && (
              <div className="comment-popup absolute left-0 top-6 z-50 w-64 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg shadow-lg">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <MessageSquare className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <button
                    onClick={() => {
                      if (onDeleteComment) onDeleteComment(comment.id);
                      setActiveCommentId(null);
                    }}
                    className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="text-sm text-foreground">{comment.content}</div>
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

  const colors: Array<{ color: MessageHighlight['color']; emoji: string; label: string }> = [
    { color: 'yellow', emoji: '🟡', label: 'Yellow' },
    { color: 'green', emoji: '🟢', label: 'Green' },
    { color: 'blue', emoji: '🔵', label: 'Blue' },
    { color: 'pink', emoji: '🔴', label: 'Pink' },
    { color: 'purple', emoji: '🟣', label: 'Purple' }
  ];

  return (
    <>
      <div
        ref={contentRef}
        onMouseUp={handleTextSelection}
        className="relative select-text leading-relaxed"
      >
        {renderAnnotatedContent()}
      </div>

      {/* Color Picker for Highlighting */}
      {colorPickerPosition && (
        <div
          className="color-picker fixed z-50 flex gap-1 p-2 bg-card border border-border rounded-lg shadow-xl"
          style={{
            left: `${colorPickerPosition.x}px`,
            top: `${colorPickerPosition.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          {colors.map(({ color, emoji, label }) => (
            <button
              key={color}
              onClick={() => handleColorSelect(color)}
              className="w-8 h-8 flex items-center justify-center hover:scale-110 transition-transform"
              title={label}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
