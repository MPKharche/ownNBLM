import { useState } from 'react';
import { MessageHighlight } from '../types';
import { StickyNote, MessageSquare, Highlighter } from 'lucide-react';

interface AnnotationToolbarProps {
  onAddNote: () => void;
  onAddComment: () => void;
  onHighlight: (color: MessageHighlight['color']) => void;
}

export function AnnotationToolbar({ onAddNote, onAddComment, onHighlight }: AnnotationToolbarProps) {
  const [showHighlightColors, setShowHighlightColors] = useState(false);

  const colors: Array<{ color: MessageHighlight['color']; emoji: string }> = [
    { color: 'yellow', emoji: '🟡' },
    { color: 'green', emoji: '🟢' },
    { color: 'blue', emoji: '🔵' },
    { color: 'pink', emoji: '🔴' },
    { color: 'purple', emoji: '🟣' }
  ];

  return (
    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
      <button
        onClick={onAddNote}
        className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded transition-colors text-yellow-700 dark:text-yellow-400"
        title="Add note"
      >
        <StickyNote className="w-3.5 h-3.5" />
        Note
      </button>

      <button
        onClick={onAddComment}
        className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors text-blue-700 dark:text-blue-400"
        title="Add comment"
      >
        <MessageSquare className="w-3.5 h-3.5" />
        Comment
      </button>

      <div className="relative">
        <button
          onClick={() => setShowHighlightColors(!showHighlightColors)}
          className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded transition-colors text-purple-700 dark:text-purple-400"
          title="Highlight text"
        >
          <Highlighter className="w-3.5 h-3.5" />
          Highlight
        </button>

        {showHighlightColors && (
          <div className="absolute left-0 bottom-full mb-1 flex gap-1 p-2 bg-card border border-border rounded-lg shadow-lg z-50">
            {colors.map(({ color, emoji }) => (
              <button
                key={color}
                onClick={() => {
                  onHighlight(color);
                  setShowHighlightColors(false);
                }}
                className="w-7 h-7 flex items-center justify-center hover:scale-110 transition-transform text-base"
                title={color}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
