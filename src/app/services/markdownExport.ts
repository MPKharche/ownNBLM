// Export conversations and knowledge to markdown format
import { Message, Session, Citation, MessageHighlight, MessageNote, MessageComment } from '../types';

export class MarkdownExporter {
  /**
   * Export a complete session with all messages, annotations, and citations
   */
  static exportSession(
    session: Session,
    messages: Message[],
    options?: {
      includeAnnotations?: boolean;
      includeCitations?: boolean;
      includeMetadata?: boolean;
    }
  ): string {
    const opts = {
      includeAnnotations: true,
      includeCitations: true,
      includeMetadata: true,
      ...options
    };

    let markdown = '';

    // Header
    markdown += `# ${session.name}\n\n`;

    // Metadata
    if (opts.includeMetadata) {
      markdown += `> **Session ID:** ${session.id}\n`;
      markdown += `> **Mode:** ${session.mode === 'corpus' ? 'All Sources' : 'Scoped Documents'}\n`;
      markdown += `> **Created:** ${new Date(session.createdAt).toLocaleString()}\n`;
      markdown += `> **Last Updated:** ${new Date(session.lastMessageAt).toLocaleString()}\n`;
      markdown += `> **Message Count:** ${session.messageCount}\n`;
      markdown += `\n---\n\n`;
    }

    // Messages
    messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        markdown += `## 💭 Question ${Math.floor(idx / 2) + 1}\n\n`;
        markdown += `${msg.content}\n\n`;
      } else {
        markdown += `### 🤖 Answer\n\n`;
        markdown += `${msg.content}\n\n`;

        // Citations
        if (opts.includeCitations && msg.citations && msg.citations.length > 0) {
          markdown += `#### 📚 Sources\n\n`;
          msg.citations.forEach((citation, citIdx) => {
            markdown += `${citIdx + 1}. **${citation.docName}**\n`;
            if (citation.pageStart) {
              markdown += `   - Pages: ${citation.pageStart}${citation.pageEnd && citation.pageEnd !== citation.pageStart ? `-${citation.pageEnd}` : ''}\n`;
            }
            if (citation.lineStart) {
              markdown += `   - Lines: ${citation.lineStart}${citation.lineEnd && citation.lineEnd !== citation.lineStart ? `-${citation.lineEnd}` : ''}\n`;
            }
            markdown += `   - Excerpt: "${citation.excerpt}"\n`;
            markdown += `\n`;
          });
        }

        // Annotations
        if (opts.includeAnnotations) {
          // Highlights
          if (msg.highlights && msg.highlights.length > 0) {
            markdown += `#### ✨ Highlights\n\n`;
            msg.highlights.forEach((hl) => {
              const emoji = this.getHighlightEmoji(hl.color);
              markdown += `- ${emoji} "${hl.text}"\n`;
            });
            markdown += `\n`;
          }

          // Notes
          if (msg.notes && msg.notes.length > 0) {
            markdown += `#### 📝 Notes\n\n`;
            msg.notes.forEach((note) => {
              markdown += `- ${note.content}\n`;
              markdown += `  *Added: ${new Date(note.createdAt).toLocaleString()}*\n`;
            });
            markdown += `\n`;
          }

          // Comments
          if (msg.comments && msg.comments.length > 0) {
            markdown += `#### 💬 Comments\n\n`;
            msg.comments.forEach((comment) => {
              markdown += `- ${comment.content}\n`;
              markdown += `  *Added: ${new Date(comment.createdAt).toLocaleString()}*\n`;
            });
            markdown += `\n`;
          }
        }

        markdown += `---\n\n`;
      }

      markdown += `*Message sent at ${new Date(msg.timestamp).toLocaleString()}*\n\n`;
    });

    // Footer
    markdown += `\n---\n\n`;
    markdown += `*Exported from ownNBLM on ${new Date().toLocaleString()}*\n`;

    return markdown;
  }

  /**
   * Export just annotations (highlights, notes, comments) from a session
   */
  static exportAnnotations(messages: Message[]): string {
    let markdown = `# Annotations Export\n\n`;
    markdown += `*Exported on ${new Date().toLocaleString()}*\n\n`;
    markdown += `---\n\n`;

    // Collect all annotations
    const allHighlights: Array<MessageHighlight & { messageContent: string }> = [];
    const allNotes: Array<MessageNote & { messageContent: string }> = [];
    const allComments: Array<MessageComment & { messageContent: string }> = [];

    messages.forEach(msg => {
      const preview = msg.content.substring(0, 80) + (msg.content.length > 80 ? '...' : '');

      msg.highlights?.forEach(hl => {
        allHighlights.push({ ...hl, messageContent: preview });
      });

      msg.notes?.forEach(note => {
        allNotes.push({ ...note, messageContent: preview });
      });

      msg.comments?.forEach(comment => {
        allComments.push({ ...comment, messageContent: preview });
      });
    });

    // Highlights
    if (allHighlights.length > 0) {
      markdown += `## ✨ Highlights (${allHighlights.length})\n\n`;
      allHighlights.forEach((hl, idx) => {
        const emoji = this.getHighlightEmoji(hl.color);
        markdown += `${idx + 1}. ${emoji} **"${hl.text}"**\n`;
        markdown += `   - From: "${hl.messageContent}"\n`;
        markdown += `   - Added: ${new Date(hl.createdAt).toLocaleString()}\n\n`;
      });
      markdown += `---\n\n`;
    }

    // Notes
    if (allNotes.length > 0) {
      markdown += `## 📝 Notes (${allNotes.length})\n\n`;
      allNotes.forEach((note, idx) => {
        markdown += `${idx + 1}. ${note.content}\n`;
        markdown += `   - From: "${note.messageContent}"\n`;
        markdown += `   - Added: ${new Date(note.createdAt).toLocaleString()}\n\n`;
      });
      markdown += `---\n\n`;
    }

    // Comments
    if (allComments.length > 0) {
      markdown += `## 💬 Comments (${allComments.length})\n\n`;
      allComments.forEach((comment, idx) => {
        markdown += `${idx + 1}. ${comment.content}\n`;
        markdown += `   - From: "${comment.messageContent}"\n`;
        markdown += `   - Added: ${new Date(comment.createdAt).toLocaleString()}\n\n`;
      });
    }

    return markdown;
  }

  /**
   * Download markdown as a file
   */
  static downloadMarkdown(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Copy markdown to clipboard
   */
  static async copyToClipboard(content: string): Promise<void> {
    await navigator.clipboard.writeText(content);
  }

  private static getHighlightEmoji(color: MessageHighlight['color']): string {
    switch (color) {
      case 'yellow': return '🟡';
      case 'green': return '🟢';
      case 'blue': return '🔵';
      case 'pink': return '🔴';
      case 'purple': return '🟣';
      default: return '⚪';
    }
  }
}
