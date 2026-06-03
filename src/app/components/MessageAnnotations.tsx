import { useState } from 'react';
import { MessageHighlight, MessageNote, MessageComment } from '../types';
import {
  StickyNote,
  MessageSquare,
  Highlighter,
  X,
  Plus,
  Send
} from 'lucide-react';

interface MessageAnnotationsProps {
  messageId: string;
  highlights: MessageHighlight[];
  notes: MessageNote[];
  comments: MessageComment[];
  onAddHighlight: (text: string, color: MessageHighlight['color']) => void;
  onAddNote: (content: string) => void;
  onAddComment: (content: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function MessageAnnotations({
  messageId,
  highlights,
  notes,
  comments,
  onAddNote,
  onAddComment,
  onDeleteNote,
  onDeleteComment
}: MessageAnnotationsProps) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [showCommentInput, setShowCommentInput] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [commentContent, setCommentContent] = useState('');
  const [selectedText, setSelectedText] = useState('');

  const handleAddNote = () => {
    if (noteContent.trim()) {
      onAddNote(noteContent.trim());
      setNoteContent('');
      setShowNoteInput(false);
    }
  };

  const handleAddComment = () => {
    if (commentContent.trim()) {
      onAddComment(commentContent.trim());
      setCommentContent('');
      setShowCommentInput(false);
    }
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text) {
      setSelectedText(text);
    }
  };

  const highlightColors: Array<{ color: MessageHighlight['color']; label: string; bg: string }> = [
    { color: 'yellow', label: '🟡 Yellow', bg: 'bg-yellow-200 dark:bg-yellow-900' },
    { color: 'green', label: '🟢 Green', bg: 'bg-green-200 dark:bg-green-900' },
    { color: 'blue', label: '🔵 Blue', bg: 'bg-blue-200 dark:bg-blue-900' },
    { color: 'pink', label: '🔴 Pink', bg: 'bg-pink-200 dark:bg-pink-900' },
    { color: 'purple', label: '🟣 Purple', bg: 'bg-purple-200 dark:bg-purple-900' }
  ];

  return (
    <div className="mt-3 space-y-3 border-t border-border pt-3">
      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Highlights:</div>
          {highlights.map(highlight => (
            <div
              key={highlight.id}
              className={`p-2 rounded text-sm ${
                highlight.color === 'yellow' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-900 dark:text-yellow-100' :
                highlight.color === 'green' ? 'bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100' :
                highlight.color === 'blue' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100' :
                highlight.color === 'pink' ? 'bg-pink-100 dark:bg-pink-900/30 text-pink-900 dark:text-pink-100' :
                'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100'
              }`}
            >
              "{highlight.text}"
            </div>
          ))}
        </div>
      )}

      {/* Notes */}
      {notes.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Notes:</div>
          {notes.map(note => (
            <div
              key={note.id}
              className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded p-2 flex items-start gap-2"
            >
              <StickyNote className="w-3.5 h-3.5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground">{note.content}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(note.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => onDeleteNote(note.id)}
                className="p-1 hover:bg-yellow-200 dark:hover:bg-yellow-800 rounded"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Comments:</div>
          {comments.map(comment => (
            <div
              key={comment.id}
              className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-2 flex items-start gap-2"
            >
              <MessageSquare className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-foreground">{comment.content}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(comment.createdAt).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => onDeleteComment(comment.id)}
                className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded"
              >
                <X className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Text Selection Highlighting */}
      {selectedText && (
        <div className="bg-accent border border-border rounded p-2">
          <div className="text-xs font-medium text-foreground mb-2">
            Highlight selected text: "{selectedText.substring(0, 50)}..."
          </div>
          <div className="flex gap-1 flex-wrap">
            {highlightColors.map(({ color, label, bg }) => (
              <button
                key={color}
                onClick={() => {
                  // onAddHighlight(selectedText, color);
                  setSelectedText('');
                }}
                className={`text-xs px-2 py-1 rounded ${bg} hover:opacity-80 transition-opacity`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setShowNoteInput(!showNoteInput)}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-800 transition-colors"
        >
          <StickyNote className="w-3 h-3" />
          Add Note
        </button>
        <button
          onClick={() => setShowCommentInput(!showCommentInput)}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors"
        >
          <MessageSquare className="w-3 h-3" />
          Add Comment
        </button>
        <button
          onMouseUp={handleTextSelection}
          className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800 transition-colors"
        >
          <Highlighter className="w-3 h-3" />
          Highlight Text
        </button>
      </div>

      {/* Note Input */}
      {showNoteInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="Write a note..."
            className="flex-1 px-3 py-2 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddNote();
              if (e.key === 'Escape') setShowNoteInput(false);
            }}
            autoFocus
          />
          <button
            onClick={handleAddNote}
            className="px-3 py-2 bg-yellow-600 dark:bg-yellow-700 text-white rounded hover:bg-yellow-700 dark:hover:bg-yellow-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Comment Input */}
      {showCommentInput && (
        <div className="flex gap-2">
          <input
            type="text"
            value={commentContent}
            onChange={(e) => setCommentContent(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 px-3 py-2 text-sm border border-input bg-background text-foreground rounded focus:outline-none focus:ring-2 focus:ring-ring"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddComment();
              if (e.key === 'Escape') setShowCommentInput(false);
            }}
            autoFocus
          />
          <button
            onClick={handleAddComment}
            className="px-3 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
