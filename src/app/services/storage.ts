// Persistent storage service for app-wide data synchronization
import {
  Source,
  Document,
  Session,
  Message,
  Annotation,
  MessageHighlight,
  MessageNote,
  MessageComment
} from '../types';

const STORAGE_KEYS = {
  SOURCES: 'ownnblm_sources',
  DOCUMENTS: 'ownnblm_documents',
  SESSIONS: 'ownnblm_sessions',
  MESSAGES: 'ownnblm_messages',
  ANNOTATIONS: 'ownnblm_annotations'
} as const;

class StorageService {
  // Generic storage methods
  private get<T>(key: string, defaultValue: T): T {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading from storage (${key}):`, error);
      return defaultValue;
    }
  }

  private set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));

      // Dispatch custom event for same-tab sync
      window.dispatchEvent(new CustomEvent('ownnblm-storage-change', {
        detail: { key, value }
      }));

      // Dispatch storage event for cross-tab sync
      window.dispatchEvent(new StorageEvent('storage', {
        key,
        newValue: JSON.stringify(value),
        storageArea: localStorage
      }));
    } catch (error) {
      console.error(`Error writing to storage (${key}):`, error);
    }
  }

  // Sources
  getSources(): Source[] {
    return this.get<Source[]>(STORAGE_KEYS.SOURCES, []);
  }

  setSources(sources: Source[]): void {
    this.set(STORAGE_KEYS.SOURCES, sources);
  }

  // Documents
  getDocuments(): Document[] {
    return this.get<Document[]>(STORAGE_KEYS.DOCUMENTS, []);
  }

  setDocuments(documents: Document[]): void {
    this.set(STORAGE_KEYS.DOCUMENTS, documents);
  }

  // Sessions
  getSessions(): Session[] {
    return this.get<Session[]>(STORAGE_KEYS.SESSIONS, []);
  }

  setSessions(sessions: Session[]): void {
    this.set(STORAGE_KEYS.SESSIONS, sessions);
  }

  // Messages
  getMessages(): Map<string, Message[]> {
    const data = this.get<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES, {});
    return new Map(Object.entries(data));
  }

  setMessages(messages: Map<string, Message[]>): void {
    const data = Object.fromEntries(messages);
    this.set(STORAGE_KEYS.MESSAGES, data);
  }

  getSessionMessages(sessionId: string): Message[] {
    const allMessages = this.getMessages();
    return allMessages.get(sessionId) || [];
  }

  setSessionMessages(sessionId: string, messages: Message[]): void {
    const allMessages = this.getMessages();
    allMessages.set(sessionId, messages);
    this.setMessages(allMessages);
  }

  // Update a specific message within a session
  updateMessage(sessionId: string, messageId: string, updates: Partial<Message>): void {
    const messages = this.getSessionMessages(sessionId);
    const messageIndex = messages.findIndex(m => m.id === messageId);

    if (messageIndex !== -1) {
      messages[messageIndex] = { ...messages[messageIndex], ...updates };
      this.setSessionMessages(sessionId, messages);
    }
  }

  // Annotations
  getAnnotations(): Annotation[] {
    return this.get<Annotation[]>(STORAGE_KEYS.ANNOTATIONS, []);
  }

  setAnnotations(annotations: Annotation[]): void {
    this.set(STORAGE_KEYS.ANNOTATIONS, annotations);
  }

  // Highlights
  addHighlight(
    sessionId: string,
    messageId: string,
    highlight: MessageHighlight
  ): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message) {
      if (!message.highlights) message.highlights = [];
      message.highlights.push(highlight);
      this.setSessionMessages(sessionId, messages);
    }
  }

  deleteHighlight(sessionId: string, messageId: string, highlightId: string): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message && message.highlights) {
      message.highlights = message.highlights.filter(h => h.id !== highlightId);
      this.setSessionMessages(sessionId, messages);
    }
  }

  // Notes
  addNote(sessionId: string, messageId: string, note: MessageNote): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message) {
      if (!message.notes) message.notes = [];
      message.notes.push(note);
      this.setSessionMessages(sessionId, messages);
    }
  }

  updateNote(sessionId: string, messageId: string, noteId: string, content: string): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message && message.notes) {
      const note = message.notes.find(n => n.id === noteId);
      if (note) {
        note.content = content;
        this.setSessionMessages(sessionId, messages);
      }
    }
  }

  deleteNote(sessionId: string, messageId: string, noteId: string): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message && message.notes) {
      message.notes = message.notes.filter(n => n.id !== noteId);
      this.setSessionMessages(sessionId, messages);
    }
  }

  // Comments
  addComment(sessionId: string, messageId: string, comment: MessageComment): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message) {
      if (!message.comments) message.comments = [];
      message.comments.push(comment);
      this.setSessionMessages(sessionId, messages);
    }
  }

  updateComment(sessionId: string, messageId: string, commentId: string, content: string): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message && message.comments) {
      const comment = message.comments.find(c => c.id === commentId);
      if (comment) {
        comment.content = content;
        this.setSessionMessages(sessionId, messages);
      }
    }
  }

  deleteComment(sessionId: string, messageId: string, commentId: string): void {
    const messages = this.getSessionMessages(sessionId);
    const message = messages.find(m => m.id === messageId);

    if (message && message.comments) {
      message.comments = message.comments.filter(c => c.id !== commentId);
      this.setSessionMessages(sessionId, messages);
    }
  }

  // Initialize with mock data if storage is empty
  initializeWithMockData(
    sources: Source[],
    documents: Document[],
    sessions: Session[],
    messagesBySession: Map<string, Message[]>,
    annotations: Annotation[]
  ): void {
    // Only initialize if storage is empty
    if (this.getSources().length === 0) {
      this.setSources(sources);
    }
    if (this.getDocuments().length === 0) {
      this.setDocuments(documents);
    }
    if (this.getSessions().length === 0) {
      this.setSessions(sessions);
    }
    if (this.getMessages().size === 0) {
      this.setMessages(messagesBySession);
    }
    if (this.getAnnotations().length === 0) {
      this.setAnnotations(annotations);
    }
  }

  // Clear all data (for testing/reset)
  clearAll(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      localStorage.removeItem(key);
    });
  }
}

export const storage = new StorageService();
