# Inline Annotations System - User Guide

## How It Works (Like Google Docs)

The new inline annotation system allows you to annotate chat messages directly in the text, just like commenting in Google Docs.

---

## 📝 Features

### 1. **Text Selection Toolbar**
When you select any text in an assistant message:
- A floating toolbar appears above the selection
- Toolbar contains: Highlight colors (🟡🟢🔵🔴🟣) | Note | Comment

### 2. **Highlighting**
- Select text → Click a color emoji
- Text immediately gets highlighted
- Highlight appears directly on the text (yellow, green, blue, pink, or purple)

### 3. **Notes**
- Select text → Click "Note"
- A popup appears right where you selected
- Type your note → Save (Cmd/Ctrl+Enter or click Save)
- A small 📝 icon appears in the text where you added the note
- Click the icon anytime to view/delete the note

### 4. **Comments**
- Select text → Click "Comment"
- A popup appears for you to type
- Type your comment → Save
- A small 💬 icon appears in the text
- Click the icon to view/delete the comment

---

## 🎯 User Flow

### Adding a Highlight
```
1. Select text: "gradient descent"
2. Toolbar appears above selection
3. Click 🟡 (yellow)
4. Text is now highlighted in yellow
```

### Adding a Note
```
1. Select text: "backpropagation calculates what gradients to use"
2. Toolbar appears
3. Click "Note" button
4. Popup opens right there
5. Type: "Key concept for exam"
6. Press Cmd+Enter or click Save
7. Small 📝 icon appears in the text
8. Click 📝 anytime to see your note
```

### Adding a Comment
```
1. Select text: "This combination enables deep learning"
2. Toolbar appears
3. Click "Comment"
4. Type: "Great summary!"
5. Save
6. Small 💬 icon appears
7. Click 💬 to view/delete
```

---

## 🎨 UI Behavior

### Selection Toolbar Position
- Appears centered above your selection
- Floats over other content
- Disappears when you click elsewhere

### Note/Comment Popups
- Appear right where you selected text
- Stay open until you save or cancel
- Click outside to dismiss
- Press Escape to cancel

### Annotation Icons (📝 💬)
- Small, unobtrusive icons in the text
- Hover shows a subtle highlight
- Click to open popup
- Popup has delete button (X)

### Highlights
- Applied directly to text (like a marker)
- Multiple colors available
- Text stays readable
- Works in both light and dark mode

---

## 🔧 Technical Details

### How Positions Are Tracked
```typescript
interface MessageNote {
  id: string;
  content: string;
  offset: number;  // Character position in text where note was added
  createdAt: string;
}
```

The `offset` is the position in the message content where the annotation was created. This allows us to insert the icon at the exact spot you selected.

### Text Rendering
The message content is split into segments:
1. Plain text
2. Highlighted text (with `<mark>` tags)
3. Note icons (📝)
4. Comment icons (💬)

Everything renders inline, preserving the flow of the text.

---

## 💡 Tips

### Best Practices
- **Highlight**: Use for important facts or concepts you want to remember
- **Notes**: Use for personal insights, summaries, or reminders
- **Comments**: Use for questions, reactions, or discussion points

### Keyboard Shortcuts
- **Cmd/Ctrl+Enter**: Save note or comment while typing
- **Escape**: Cancel and close popup

### Multiple Annotations
- You can have multiple highlights, notes, and comments on the same message
- Icons appear in order of where they were added
- Each annotation is independent

---

## 🚀 What's Different from Before

### Old System
- Annotations appeared in a separate section below the message
- Took up a lot of space
- Hard to see what text was annotated
- Required scrolling to see both text and annotations

### New System
- ✅ Annotations are **inline** (right in the text)
- ✅ Icons are **small and unobtrusive**
- ✅ Highlights are **visible immediately**
- ✅ No extra scrolling needed
- ✅ More like **Google Docs** commenting
- ✅ Cleaner, more **focused interface**

---

## 🎬 Demo Scenario

Let's say the AI responds:

> "Gradient descent is an optimization algorithm that iteratively adjusts model weights to minimize a loss function. Backpropagation calculates the gradients needed for this process."

You can:

1. **Highlight** "Gradient descent is an optimization algorithm" in 🟡 yellow
2. **Add a note** 📝 on "iteratively adjusts model weights" saying "This is the key part"
3. **Add a comment** 💬 on the whole paragraph saying "Very clear explanation!"

Result:
> "<mark class='yellow'>Gradient descent is an optimization algorithm</mark> that <mark>iteratively adjusts model weights</mark> 📝 to minimize a loss function. Backpropagation calculates the gradients needed for this process." 💬

Click 📝 → See your note  
Click 💬 → See your comment

---

## 🐛 Known Limitations

1. **Plain text only**: Currently works on plain text in the message. Doesn't work inside code blocks yet.
2. **No nested annotations**: Can't add a note inside a highlight (not usually needed)
3. **Position tracking**: If the message content changes, positions might shift (edge case)

---

## 🔮 Future Enhancements

- [ ] Annotation threads (reply to comments)
- [ ] @mentions in comments (tag team members)
- [ ] Annotation history (see who added what when)
- [ ] Search across all annotations
- [ ] Filter messages by annotation type
- [ ] Export annotations with context

---

## 🎓 For Developers

### Component: `InlineAnnotatableMessage`

**Props:**
```typescript
{
  content: string;                    // Message text
  messageId: string;                  // Message ID
  highlights: MessageHighlight[];     // Existing highlights
  notes: MessageNote[];              // Existing notes
  comments: MessageComment[];        // Existing comments
  onAddHighlight: (text, color, start, end) => void;
  onAddNote: (content, offset) => void;
  onAddComment: (content, offset) => void;
  onDeleteNote: (noteId) => void;
  onDeleteComment: (commentId) => void;
}
```

**Usage:**
```typescript
<InlineAnnotatableMessage
  content={message.content}
  messageId={message.id}
  highlights={message.highlights || []}
  notes={message.notes || []}
  comments={message.comments || []}
  onAddHighlight={(text, color, start, end) => 
    handleAddHighlight(message.id, text, color, start, end)
  }
  onAddNote={(content, offset) => 
    handleAddNote(message.id, content, offset)
  }
  onAddComment={(content, offset) => 
    handleAddComment(message.id, content, offset)
  }
  onDeleteNote={(noteId) => 
    handleDeleteNote(message.id, noteId)
  }
  onDeleteComment={(commentId) => 
    handleDeleteComment(message.id, commentId)
  }
/>
```

### API Updates

Added `offset` parameter to note/comment creation:

```typescript
// Before
api.addNote(sessionId, messageId, content);

// Now
api.addNote(sessionId, messageId, content, offset);
```

The offset indicates where in the text the annotation was created.

---

*Last updated: 2026-05-31*  
*Component: `InlineAnnotatableMessage.tsx`*
