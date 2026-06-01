// Mock API service - simulates backend calls with persistent storage
import {
  Source,
  Document,
  Session,
  Message,
  Annotation,
  AppSettings,
  Citation,
  MessageHighlight,
  MessageNote,
  MessageComment
} from '../types';
import {
  mockSources,
  mockDocuments,
  mockSessions,
  mockMessages,
  mockAnnotations,
  sampleCitations
} from './mockData';
import { storage } from './storage';

// Simulated delay for realistic API behavior
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class MockAPI {
  constructor() {
    // Initialize storage with mock data on first load
    storage.initializeWithMockData(
      mockSources,
      mockDocuments,
      mockSessions,
      new Map([['session-corpus', [...mockMessages]]]),
      mockAnnotations
    );
  }

  // Sources
  async getSources(): Promise<Source[]> {
    await delay(200);
    return storage.getSources();
  }

  async addSource(path: string, label: string): Promise<Source> {
    await delay(300);
    const newSource: Source = {
      id: `src-${Date.now()}`,
      path,
      label,
      watchEnabled: true,
      lastScanAt: null,
      status: 'scanning',
      documentCount: 0
    };

    const sources = storage.getSources();
    sources.push(newSource);
    storage.setSources(sources);

    setTimeout(() => {
      const updatedSources = storage.getSources();
      const source = updatedSources.find(s => s.id === newSource.id);
      if (source) {
        source.status = 'idle';
        source.lastScanAt = new Date().toISOString();
        source.documentCount = Math.floor(Math.random() * 20) + 5;
        storage.setSources(updatedSources);
      }
    }, 2000);

    return newSource;
  }

  async updateSource(id: string, updates: Partial<Source>): Promise<Source> {
    await delay(200);
    const sources = storage.getSources();
    const source = sources.find(s => s.id === id);
    if (!source) throw new Error('Source not found');
    Object.assign(source, updates);
    storage.setSources(sources);
    return source;
  }

  async deleteSource(id: string): Promise<void> {
    await delay(200);
    const sources = storage.getSources().filter(s => s.id !== id);
    storage.setSources(sources);

    const documents = storage.getDocuments().filter(d => d.sourceId !== id);
    storage.setDocuments(documents);
  }

  async rescanSource(id: string): Promise<void> {
    const sources = storage.getSources();
    const source = sources.find(s => s.id === id);
    if (!source) throw new Error('Source not found');

    source.status = 'scanning';
    storage.setSources(sources);
    await delay(300);

    setTimeout(() => {
      const updatedSources = storage.getSources();
      const updatedSource = updatedSources.find(s => s.id === id);
      if (updatedSource) {
        updatedSource.status = 'idle';
        updatedSource.lastScanAt = new Date().toISOString();
        storage.setSources(updatedSources);
      }
    }, 1500);
  }

  // Documents
  async getDocuments(sourceId?: string): Promise<Document[]> {
    await delay(250);
    const documents = storage.getDocuments();
    return sourceId
      ? documents.filter(d => d.sourceId === sourceId)
      : documents;
  }

  async getDocument(id: string): Promise<Document | null> {
    await delay(150);
    return storage.getDocuments().find(d => d.id === id) || null;
  }

  // Sessions
  async getSessions(): Promise<Session[]> {
    await delay(200);
    return storage.getSessions();
  }

  async createSession(name: string, docIds: string[]): Promise<Session> {
    await delay(300);
    const newSession: Session = {
      id: `session-${Date.now()}`,
      name,
      mode: docIds.length > 0 ? 'scoped' : 'corpus',
      docIds,
      createdAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
      messageCount: 0
    };

    const sessions = storage.getSessions();
    sessions.push(newSession);
    storage.setSessions(sessions);
    storage.setSessionMessages(newSession.id, []);

    return newSession;
  }

  async deleteSession(id: string): Promise<void> {
    await delay(200);
    const sessions = storage.getSessions().filter(s => s.id !== id);
    storage.setSessions(sessions);

    const allMessages = storage.getMessages();
    allMessages.delete(id);
    storage.setMessages(allMessages);
  }

  // Messages
  async getMessages(sessionId: string): Promise<Message[]> {
    await delay(250);
    return storage.getSessionMessages(sessionId);
  }

  async sendMessage(sessionId: string, content: string): Promise<Message> {
    await delay(300);

    const userMessage: Message = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    };

    const messages = storage.getSessionMessages(sessionId);
    messages.push(userMessage);
    storage.setSessionMessages(sessionId, messages);

    const sessions = storage.getSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.lastMessageAt = new Date().toISOString();
      session.messageCount++;
      storage.setSessions(sessions);
    }

    return userMessage;
  }

  async *streamAssistantResponse(
    sessionId: string,
    userMessage: string
  ): AsyncGenerator<{ content: string; citations?: Citation[] }> {
    await delay(500);

    const fullResponse = this.generateMockResponse(userMessage);
    const words = fullResponse.split(' ');

    for (let i = 0; i < words.length; i += 3) {
      const chunk = words.slice(i, i + 3).join(' ') + ' ';
      yield { content: chunk };
      await delay(50);
    }

    const useCitations = Math.random() > 0.3;
    if (useCitations) {
      yield {
        content: '',
        citations: sampleCitations.slice(0, Math.floor(Math.random() * 2) + 1)
      };
    }
  }

  async saveAssistantMessage(
    sessionId: string,
    content: string,
    citations?: Citation[]
  ): Promise<Message> {
    const assistantMessage: Message = {
      id: `msg-${Date.now()}-assistant`,
      role: 'assistant',
      content,
      citations,
      timestamp: new Date().toISOString()
    };

    const messages = storage.getSessionMessages(sessionId);
    messages.push(assistantMessage);
    storage.setSessionMessages(sessionId, messages);

    const sessions = storage.getSessions();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      session.lastMessageAt = new Date().toISOString();
      session.messageCount++;
      storage.setSessions(sessions);
    }

    return assistantMessage;
  }

  private generateMockResponse(question: string): string {
    const responses = [
      `Based on the documents in your corpus, here's what I found: The concept you're asking about is covered extensively across multiple sources. Let me break this down into key points that will help you understand this topic better.`,
      `I've analyzed the relevant documents and can provide you with a comprehensive answer. The information spans several pages across different sources, each contributing unique insights to your question.`,
      `After reviewing the indexed content, I can explain this concept from multiple perspectives found in your documents. This approach will give you a well-rounded understanding of the topic.`
    ];

    const details = [
      `First, it's important to understand the foundational principles. These concepts build upon each other systematically, creating a framework for deeper understanding.`,
      `The key mechanisms involve several interrelated processes that work together. Each component plays a specific role in the overall system.`,
      `This approach has evolved significantly over time, with recent developments addressing earlier limitations and expanding practical applications.`
    ];

    return responses[Math.floor(Math.random() * responses.length)] + ' ' +
           details[Math.floor(Math.random() * details.length)];
  }

  // Annotations
  async getAnnotations(sessionId: string): Promise<Annotation[]> {
    await delay(200);
    return storage.getAnnotations().filter(a => a.sessionId === sessionId);
  }

  async createAnnotation(
    sessionId: string,
    docId: string,
    type: Annotation['type'],
    content: string,
    anchor: Annotation['anchor']
  ): Promise<Annotation> {
    await delay(250);
    const newAnnotation: Annotation = {
      id: `ann-${Date.now()}`,
      sessionId,
      docId,
      type,
      content,
      anchor,
      createdAt: new Date().toISOString()
    };

    const annotations = storage.getAnnotations();
    annotations.push(newAnnotation);
    storage.setAnnotations(annotations);

    return newAnnotation;
  }

  async deleteAnnotation(id: string): Promise<void> {
    await delay(200);
    const annotations = storage.getAnnotations().filter(a => a.id !== id);
    storage.setAnnotations(annotations);
  }

  // Message Annotations
  async addHighlight(
    sessionId: string,
    messageId: string,
    text: string,
    color: MessageHighlight['color'],
    startOffset: number,
    endOffset: number
  ): Promise<MessageHighlight> {
    await delay(200);

    const highlight: MessageHighlight = {
      id: `hl-${Date.now()}`,
      text,
      color,
      startOffset,
      endOffset,
      createdAt: new Date().toISOString()
    };

    storage.addHighlight(sessionId, messageId, highlight);
    return highlight;
  }

  async addNote(sessionId: string, messageId: string, content: string, offset?: number): Promise<MessageNote> {
    await delay(200);

    const note: MessageNote = {
      id: `note-${Date.now()}`,
      content,
      offset,
      createdAt: new Date().toISOString()
    };

    storage.addNote(sessionId, messageId, note);
    return note;
  }

  async addComment(sessionId: string, messageId: string, content: string, offset?: number): Promise<MessageComment> {
    await delay(200);

    const comment: MessageComment = {
      id: `comment-${Date.now()}`,
      content,
      offset,
      createdAt: new Date().toISOString()
    };

    storage.addComment(sessionId, messageId, comment);
    return comment;
  }

  async deleteNote(sessionId: string, messageId: string, noteId: string): Promise<void> {
    await delay(200);
    storage.deleteNote(sessionId, messageId, noteId);
  }

  async deleteComment(sessionId: string, messageId: string, commentId: string): Promise<void> {
    await delay(200);
    storage.deleteComment(sessionId, messageId, commentId);
  }

  // Settings
  async getSettings(): Promise<AppSettings> {
    await delay(150);
    return {
      openRouterApiKey: localStorage.getItem('openrouter_key') || '',
      openRouterModel: localStorage.getItem('openrouter_model') || 'openrouter/anthropic/claude-sonnet-4',
      watchInterval: parseInt(localStorage.getItem('watch_interval') || '60'),
      theme: (localStorage.getItem('theme') as AppSettings['theme']) || 'system'
    };
  }

  async saveSettings(settings: Partial<AppSettings>): Promise<void> {
    await delay(200);
    if (settings.openRouterApiKey !== undefined) {
      localStorage.setItem('openrouter_key', settings.openRouterApiKey);
    }
    if (settings.openRouterModel !== undefined) {
      localStorage.setItem('openrouter_model', settings.openRouterModel);
    }
    if (settings.watchInterval !== undefined) {
      localStorage.setItem('watch_interval', settings.watchInterval.toString());
    }
    if (settings.theme !== undefined) {
      localStorage.setItem('theme', settings.theme);
    }
  }
}

export const api = new MockAPI();
