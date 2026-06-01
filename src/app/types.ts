// Core data types for ownNBLM frontend

export interface Source {
  id: string;
  path: string;
  label: string;
  watchEnabled: boolean;
  lastScanAt: string | null;
  status: 'idle' | 'scanning' | 'indexing' | 'error';
  documentCount: number;
}

export interface Document {
  id: string;
  sourceId: string;
  name: string;
  relativePath: string;
  format: 'pdf' | 'md' | 'docx' | 'txt';
  pageCount?: number;
  indexStatus: 'pending' | 'indexed' | 'error';
  fileSize: number;
  lastModified: string;
  createdAt: string;
}

export interface Citation {
  docId: string;
  docName: string;
  pageStart?: number;
  pageEnd?: number;
  lineStart?: number;
  lineEnd?: number;
  excerpt: string;
  deepLink: string;
}

export interface MessageHighlight {
  id: string;
  text: string;
  color: 'yellow' | 'green' | 'blue' | 'pink' | 'purple';
  startOffset: number;
  endOffset: number;
  createdAt: string;
}

export interface MessageNote {
  id: string;
  content: string;
  offset?: number; // Position in text where note was added
  createdAt: string;
}

export interface MessageComment {
  id: string;
  content: string;
  offset?: number; // Position in text where comment was added
  createdAt: string;
  replyTo?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp: string;
  isStreaming?: boolean;
  highlights?: MessageHighlight[];
  notes?: MessageNote[];
  comments?: MessageComment[];
}

export interface Session {
  id: string;
  name: string;
  mode: 'corpus' | 'scoped';
  docIds: string[];
  createdAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface Annotation {
  id: string;
  sessionId: string;
  docId: string;
  type: 'note' | 'highlight' | 'bookmark';
  content: string;
  anchor: {
    page?: number;
    lineStart?: number;
    lineEnd?: number;
  };
  createdAt: string;
}

export interface AppSettings {
  openRouterApiKey: string;
  openRouterModel: string;
  watchInterval: number;
  theme: 'light' | 'dark' | 'system';
}

export interface IndexJob {
  id: string;
  docId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// Mind map / Document map types
export interface MindMapNode {
  id: string;
  content: string;
  messageId?: string;
  children: MindMapNode[];
  position: { x: number; y: number };
  color?: string;
}

export interface DocumentMap {
  sessionId: string;
  nodes: MindMapNode[];
  connections: Array<{ from: string; to: string }>;
}
