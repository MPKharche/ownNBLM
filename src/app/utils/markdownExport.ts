import { Message, Session } from '../types';

export function exportSessionToMarkdown(
  session: Session,
  messages: Message[]
): string {
  let markdown = `# ${session.name}\n\n`;
  markdown += `**Mode:** ${session.mode === 'corpus' ? 'Corpus-wide' : 'Scoped Session'}\n\n`;
  markdown += `**Created:** ${new Date(session.createdAt).toLocaleString()}\n\n`;
  markdown += `**Last Updated:** ${new Date(session.lastMessageAt).toLocaleString()}\n\n`;
  markdown += `**Total Messages:** ${session.messageCount}\n\n`;

  if (session.mode === 'scoped' && session.docIds.length > 0) {
    markdown += `**Documents in Scope:** ${session.docIds.length}\n\n`;
  }

  markdown += `---\n\n`;

  // Add table of contents for long sessions
  if (messages.length > 5) {
    markdown += `## Table of Contents\n\n`;
    messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        const preview = msg.content.substring(0, 50).replace(/\n/g, ' ');
        markdown += `${idx + 1}. [${preview}${msg.content.length > 50 ? '...' : ''}](#message-${idx + 1})\n`;
      }
    });
    markdown += `\n---\n\n`;
  }

  // Add messages
  messages.forEach((msg, idx) => {
    markdown += `## Message ${idx + 1}\n\n`;
    markdown += `<a name="message-${idx + 1}"></a>\n\n`;

    const role = msg.role === 'user' ? '**You**' : '**Assistant**';
    const timestamp = new Date(msg.timestamp).toLocaleString();

    markdown += `### ${role}\n`;
    markdown += `*${timestamp}*\n\n`;
    markdown += `${msg.content}\n\n`;

    // Add citations
    if (msg.citations && msg.citations.length > 0) {
      markdown += `#### Sources Referenced\n\n`;
      msg.citations.forEach((citation, citIdx) => {
        markdown += `${citIdx + 1}. **${citation.docName}**`;

        if (citation.pageStart) {
          markdown += ` (Page ${citation.pageStart}`;
          if (citation.pageEnd && citation.pageEnd !== citation.pageStart) {
            markdown += `-${citation.pageEnd}`;
          }
          markdown += `)`;
        } else if (citation.lineStart) {
          markdown += ` (Lines ${citation.lineStart}`;
          if (citation.lineEnd && citation.lineEnd !== citation.lineStart) {
            markdown += `-${citation.lineEnd}`;
          }
          markdown += `)`;
        }

        markdown += `\n\n`;
        markdown += `   > ${citation.excerpt}\n\n`;
      });
    }

    // Add notes
    if (msg.notes && msg.notes.length > 0) {
      markdown += `#### Your Notes\n\n`;
      msg.notes.forEach(note => {
        const noteTime = new Date(note.createdAt).toLocaleString();
        markdown += `- 📝 ${note.content}\n`;
        markdown += `  *Added: ${noteTime}*\n\n`;
      });
    }

    // Add highlights
    if (msg.highlights && msg.highlights.length > 0) {
      markdown += `#### Highlights\n\n`;
      msg.highlights.forEach(highlight => {
        const highlightTime = new Date(highlight.createdAt).toLocaleString();
        markdown += `- 🎨 "${highlight.text}"\n`;
        markdown += `  *Color: ${highlight.color} | Added: ${highlightTime}*\n\n`;
      });
    }

    markdown += `---\n\n`;
  });

  // Add footer
  markdown += `\n\n---\n\n`;
  markdown += `*Exported from ownNBLM on ${new Date().toLocaleString()}*\n\n`;
  markdown += `*Session ID: ${session.id}*\n\n`;

  return markdown;
}

export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function copyMarkdownToClipboard(content: string): Promise<void> {
  return navigator.clipboard.writeText(content);
}

export function exportMessageToMarkdown(message: Message): string {
  let markdown = '';

  const role = message.role === 'user' ? 'You' : 'Assistant';
  const timestamp = new Date(message.timestamp).toLocaleString();

  markdown += `## ${role}\n`;
  markdown += `*${timestamp}*\n\n`;
  markdown += `${message.content}\n\n`;

  if (message.citations && message.citations.length > 0) {
    markdown += `### Sources\n\n`;
    message.citations.forEach((citation, idx) => {
      markdown += `${idx + 1}. **${citation.docName}**`;
      if (citation.pageStart) {
        markdown += ` (Page ${citation.pageStart}${citation.pageEnd && citation.pageEnd !== citation.pageStart ? `-${citation.pageEnd}` : ''})`;
      }
      markdown += `\n   > ${citation.excerpt}\n\n`;
    });
  }

  if (message.notes && message.notes.length > 0) {
    markdown += `### Notes\n\n`;
    message.notes.forEach(note => {
      markdown += `- ${note.content}\n`;
    });
  }

  return markdown;
}
