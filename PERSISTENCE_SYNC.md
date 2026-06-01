# Data Persistence and App-Wide Sync

## Overview

The application now has a complete persistence and synchronization system for highlights, notes, and comments. All annotations are saved to localStorage and automatically synced across the entire application.

## Architecture

### Storage Service (`src/app/services/storage.ts`)

The core storage service provides:
- **Persistent storage** using localStorage
- **App-wide synchronization** through custom events
- **Cross-tab sync** through storage events
- **Type-safe methods** for all data operations

Key features:
- All data is automatically persisted to localStorage
- Changes trigger custom `ownnblm-storage-change` events for same-tab sync
- Storage events enable cross-tab synchronization
- Structured storage keys prevent conflicts

### Storage Sync Hook (`src/app/hooks/useStorageSync.ts`)

React hook that enables real-time synchronization:
- Listens for both custom events (same tab) and storage events (cross-tab)
- Triggers component re-renders when data changes
- Provides `useSessionMessages()` helper for message sync

## How It Works

### 1. Adding Annotations

When a user adds a highlight, note, or comment:

```typescript
// User adds a highlight
await api.addHighlight(sessionId, messageId, text, color, startOffset, endOffset);
```

The flow:
1. API service creates the annotation object
2. Storage service saves it to localStorage
3. Custom event is dispatched (`ownnblm-storage-change`)
4. Storage event is dispatched for cross-tab sync
5. All components using `useStorageSync()` re-render with fresh data

### 2. Syncing Across Components

Components stay synced by using the `useStorageSync` hook:

```typescript
export function ImmersiveChatInterface({ sessionId }: Props) {
  const syncTrigger = useStorageSync(); // Listen for changes

  useEffect(() => {
    loadMessages(); // Reload when data changes
  }, [sessionId, syncTrigger]);
}
```

This ensures:
- Chat interface shows updated annotations immediately
- Annotations panel reflects changes in real-time
- All views stay consistent

### 3. Cross-Tab Synchronization

Open the app in multiple tabs:
- Changes in one tab automatically appear in others
- No manual refresh needed
- Uses browser's native `storage` event

## Components with Sync

The following components are synced:

- ✅ **ImmersiveChatInterface**: Shows highlights, notes, comments in messages
- ✅ **AnnotationsPanel**: Displays aggregated annotations
- ✅ **All message views**: Reflect annotation updates immediately

## Data Stored

All data is stored in localStorage with prefixed keys:

- `ownnblm_sources`: Source folders
- `ownnblm_documents`: Indexed documents
- `ownnblm_sessions`: Chat sessions
- `ownnblm_messages`: All messages with annotations
- `ownnblm_annotations`: Document annotations

## API Methods

### Highlights
- `api.addHighlight(sessionId, messageId, text, color, startOffset, endOffset)`
- Returns: `MessageHighlight`

### Notes
- `api.addNote(sessionId, messageId, content, offset?)`
- `api.deleteNote(sessionId, messageId, noteId)`
- Returns: `MessageNote`

### Comments
- `api.addComment(sessionId, messageId, content, offset?)`
- `api.deleteComment(sessionId, messageId, commentId)`
- Returns: `MessageComment`

## Persistence Guarantees

✅ **Data survives page refresh**: All annotations persist in localStorage
✅ **Real-time sync**: Changes appear immediately across all views
✅ **Cross-tab sync**: Multiple tabs stay in sync automatically
✅ **Type-safe**: Full TypeScript support with proper types
✅ **Error handling**: Try-catch blocks prevent data corruption

## Migration Notes

The system was upgraded from in-memory storage to persistent storage:

**Before:**
- Data stored in class variables
- Lost on page refresh
- No cross-component sync

**After:**
- Data stored in localStorage
- Persists across sessions
- Real-time app-wide sync
- Cross-tab synchronization

## Testing

To verify sync is working:

1. **Add a highlight** in a message
2. **Check AnnotationsPanel** - should appear immediately
3. **Open another tab** - highlight should be visible
4. **Refresh the page** - highlight should persist

## Future Enhancements

Potential improvements:
- IndexedDB for larger datasets
- Cloud sync for multi-device support
- Conflict resolution for concurrent edits
- Undo/redo support for annotations
- Export annotations to various formats
