# UI Redesign - Immersive Reading Mode

## Overview

The ownNBLM UI has been completely redesigned for a **focused, distraction-free learning experience**. The new design emphasizes reading comprehension, annotation, and knowledge retention.

---

## Key Features

### 1. Immersive Reading Mode 🎯

**When Active:**
- Full-screen chat interface
- All sidebars hidden by default
- Minimal floating controls at top
- Clean, distraction-free environment

**How to Enter:**
- Click "Enter Reading Mode" in footer (when messages exist)
- Automatically enters when viewing documents

**How to Exit:**
- Click "Exit Reading Mode" button in floating controls
- Sidebars restore to previous state

### 2. Split-Screen Document Viewer 📚

**Automatic Split View:**
- **Left Panel**: Chat conversation
- **Right Panel**: Referenced document
- Auto-scrolls to cited page/paragraph
- Synchronized navigation

**Features:**
- Compact PDF/Markdown viewer
- Page navigation with keyboard shortcuts
- Zoom controls (50%-200%)
- Citation highlighting (coming soon)

### 3. Collapsible Sidebars 📂

**Smart Collapse System:**
- **Left Sidebar**: Sources & document tree
- **Right Sidebar**: Sessions & notes panel
- Hover on screen edge to reveal
- Click chevron to toggle
- No padding when collapsed - completely tight

**Interaction:**
- Hidden sidebars: 1px trigger zone at screen edge
- Hover reveals toggle button
- Click anywhere on trigger to expand
- Smooth 300ms animation

### 4. In-App Annotations 📝

**Message Notes:**
- Add notes to any assistant response
- Notes saved with message
- Visible in exported markdown
- Searchable (future)

**Message Highlighting (Coming Soon):**
- Highlight important text in responses
- Color-coded categories
- Persistent across sessions

**Document Annotations:**
- Bookmarks, highlights, notes in documents
- Linked to chat citations
- Exported with session

### 5. Markdown Export 💾

**Session Export:**
- Complete chat history
- All citations with page numbers
- Your notes and highlights
- Formatted for readability
- External tools can parse

**Export Formats:**
- Full session markdown
- Individual message copy
- Direct to clipboard
- Download as .md file

**Use Cases:**
- Study notes
- Research documentation
- Knowledge base articles
- Share insights externally

---

## Design Philosophy

### Compact & Tight 🗜️

**Zero Wasted Space:**
- Minimal padding (2-3px where needed)
- Compact headers and controls
- Dense information layout
- Maximum content area

**Visual Hierarchy:**
- Important actions prominent
- Secondary controls subtle
- Hover reveals options
- Clean typography

### Reading-Focused 📖

**Optimized for Comprehension:**
- Large content area
- Readable typography (prose classes)
- Proper line spacing in messages
- Markdown rendering with syntax highlighting

**Citation Flow:**
- Inline citation chips
- Click to open document
- Auto-scroll to reference
- Side-by-side comparison

### Progressive Disclosure 🎭

**Show What's Needed:**
- Default: Chat + minimal chrome
- On demand: Sources, sessions, settings
- Hover: Action buttons, notes
- Context: Only relevant controls

---

## Component Architecture

### `ImmersiveChatInterface`
- Main chat component
- Message rendering with markdown
- Citation display and interaction
- Note-taking UI
- Export functionality

### `CompactDocumentViewer`
- PDF/Markdown preview
- Page navigation
- Zoom controls
- Citation highlighting

### `CollapsibleSidebar`
- Generic collapsible container
- Left or right positioning
- Hover triggers
- Smooth animations

### `useImmersiveMode` Hook
- Centralized state management
- Enter/exit immersive mode
- Document open/close
- Sidebar toggle

---

## Keyboard Shortcuts (Planned)

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + E` | Enter/Exit Reading Mode |
| `Cmd/Ctrl + [` | Toggle left sidebar |
| `Cmd/Ctrl + ]` | Toggle right sidebar |
| `Cmd/Ctrl + D` | Close document viewer |
| `Cmd/Ctrl + N` | Add note to message |
| `Cmd/Ctrl + Shift + E` | Export session |
| `Cmd/Ctrl + K` | Copy message to clipboard |
| `Arrow Up/Down` | Navigate document pages |
| `+/-` | Zoom in/out |

---

## Mobile Responsiveness

### Phone (< 768px)
- Single column layout
- Swipe to access sidebars
- Bottom sheet for notes
- Tap citation to view document (full screen)

### Tablet (768px - 1024px)
- Chat takes 60% width
- Document viewer 40%
- Sidebars as overlays
- Touch-optimized controls

### Desktop (> 1024px)
- Full split-screen experience
- Persistent sidebars (collapsible)
- Keyboard shortcuts enabled
- Mouse hover interactions

---

## Styling System

### Theme Variables
```css
/* Defined in src/styles/theme.css */
--background: #ffffff (light) / oklch(0.145 0 0) (dark)
--foreground: oklch(0.145 0 0) (light) / oklch(0.985 0 0) (dark)
--primary: #030213 (light) / oklch(0.985 0 0) (dark)
--border: rgba(0, 0, 0, 0.1) (light) / oklch(0.269 0 0) (dark)
```

### Compact Spacing
- Headers: `px-2 py-1.5` (8px horizontal, 6px vertical)
- Controls: `p-1` (4px all around)
- Messages: `space-y-3` (12px between messages)
- Sidebars: No horizontal padding when collapsed

### Typography
- Base: 14px (0.875rem)
- Headers: 16px (1rem)
- Small: 12px (0.75rem)
- Line height: 1.5 (readable)

---

## Performance Optimizations

### Lazy Loading
- Document viewer only loads when needed
- PDF pages rendered on demand
- Virtual scrolling for long chats (future)

### Smooth Animations
- CSS transitions (300ms ease-in-out)
- GPU-accelerated transforms
- No layout thrashing

### Memory Management
- Limit loaded messages (virtualization)
- Unload document when closed
- Cleanup on route change

---

## Accessibility

### Screen Readers
- Semantic HTML throughout
- ARIA labels on interactive elements
- Keyboard navigation support
- Focus indicators

### Contrast
- WCAG AA compliant colors
- High contrast mode support
- Readable text sizes

### Motion
- Respects `prefers-reduced-motion`
- Disable animations when requested
- Instant transitions as fallback

---

## Integration with Backend

### API Endpoints Needed

```typescript
// Notes
POST /api/messages/{id}/notes
GET  /api/messages/{id}/notes
DELETE /api/notes/{id}

// Export
GET /api/sessions/{id}/export/markdown
GET /api/messages/{id}/export/markdown

// Document Viewer
GET /api/documents/{id}/content?page={page}
GET /api/documents/{id}/highlights

// Annotations
POST /api/documents/{id}/highlights
GET  /api/sessions/{id}/annotations
```

### WebSocket Events (Future)
```typescript
// Real-time collaboration
ws.on('note_added', (note) => { ... })
ws.on('highlight_created', (highlight) => { ... })
ws.on('document_opened', (docId) => { ... })
```

---

## Future Enhancements

### Phase 2
- [ ] Text selection highlighting
- [ ] Color-coded highlight categories
- [ ] Flashcard generation from notes
- [ ] Search within session
- [ ] Keyboard shortcuts
- [ ] Touch gestures (mobile)

### Phase 3
- [ ] Collaborative sessions
- [ ] Shared annotations
- [ ] Export to Notion/Obsidian
- [ ] Voice dictation for notes
- [ ] AI-generated summaries
- [ ] Spaced repetition reminders

### Phase 4
- [ ] Video/audio annotations
- [ ] Diagram creation tools
- [ ] Mind map generation
- [ ] Version history for notes
- [ ] Template system for exports

---

## Testing Checklist

### Functional
- [ ] Enter/exit immersive mode
- [ ] Toggle sidebars independently
- [ ] Open document from citation
- [ ] Add note to message
- [ ] Export to markdown
- [ ] Copy message to clipboard
- [ ] Navigate document pages
- [ ] Zoom in/out

### Visual
- [ ] Sidebars collapse to 0 width
- [ ] Hover triggers appear
- [ ] Animations smooth (300ms)
- [ ] No layout shift
- [ ] Proper z-index stacking
- [ ] Dark mode support

### Performance
- [ ] Smooth scrolling (<16ms frames)
- [ ] Fast sidebar toggle (<300ms)
- [ ] No lag during typing
- [ ] Streaming messages fluid
- [ ] Document loads quickly

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader announces changes
- [ ] Focus indicators visible
- [ ] Contrast ratios meet WCAG AA
- [ ] Reduced motion respected

---

## Migration Guide

### From Old UI to New

**What Changed:**
- SourcesPanel now in collapsible left sidebar
- SessionPanel now in collapsible right sidebar
- ChatInterface replaced with ImmersiveChatInterface
- DocumentViewer now CompactDocumentViewer
- New useImmersiveMode hook for state

**What to Update:**
1. Replace old App.tsx with new layout
2. Import new components
3. Add markdown export utils
4. Update API to support notes
5. Test all interactions

**Breaking Changes:**
- None - fully backward compatible with backend
- Frontend state management changed (use hook)
- Component props slightly different

---

## Conclusion

The new immersive reading mode transforms ownNBLM from a chat interface into a **learning platform**. By focusing on reading comprehension, annotation, and knowledge retention, it enables users to build a personal knowledge base that grows with every conversation.

**The chat becomes the notes. The notes become knowledge.**
