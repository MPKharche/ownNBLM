// Mock data for frontend prototype
import {
  Source,
  Document,
  Session,
  Message,
  Annotation,
  Citation,
  MessageHighlight,
  MessageNote,
  MessageComment
} from '../types';

export const mockSources: Source[] = [
  {
    id: 'src-1',
    path: 'C:\\Users\\mayur\\Documents\\Research',
    label: 'Research Papers',
    watchEnabled: true,
    lastScanAt: '2026-05-31T10:30:00Z',
    status: 'idle',
    documentCount: 24
  },
  {
    id: 'src-2',
    path: 'D:\\Books',
    label: 'Technical Books',
    watchEnabled: true,
    lastScanAt: '2026-05-31T08:15:00Z',
    status: 'idle',
    documentCount: 47
  },
  {
    id: 'src-3',
    path: 'C:\\Users\\mayur\\Downloads\\AppDevelopment',
    label: 'Development Docs',
    watchEnabled: false,
    lastScanAt: null,
    status: 'idle',
    documentCount: 12
  }
];

export const mockDocuments: Document[] = [
  {
    id: 'doc-1',
    sourceId: 'src-1',
    name: 'Machine Learning Fundamentals.pdf',
    relativePath: 'AI/ML_Fundamentals.pdf',
    format: 'pdf',
    pageCount: 342,
    indexStatus: 'indexed',
    fileSize: 5242880,
    lastModified: '2026-05-20T14:30:00Z',
    createdAt: '2026-05-20T14:30:00Z'
  },
  {
    id: 'doc-2',
    sourceId: 'src-1',
    name: 'Neural Networks Deep Dive.pdf',
    relativePath: 'AI/Neural_Networks.pdf',
    format: 'pdf',
    pageCount: 215,
    indexStatus: 'indexed',
    fileSize: 3145728,
    lastModified: '2026-05-18T09:45:00Z',
    createdAt: '2026-05-18T09:45:00Z'
  },
  {
    id: 'doc-3',
    sourceId: 'src-2',
    name: 'Clean Code.pdf',
    relativePath: 'Programming/Clean_Code.pdf',
    format: 'pdf',
    pageCount: 464,
    indexStatus: 'indexed',
    fileSize: 7340032,
    lastModified: '2026-05-15T11:20:00Z',
    createdAt: '2026-05-15T11:20:00Z'
  },
  {
    id: 'doc-4',
    sourceId: 'src-3',
    name: 'PageIndex Documentation.md',
    relativePath: 'PageIndex/README.md',
    format: 'md',
    indexStatus: 'indexed',
    fileSize: 45678,
    lastModified: '2026-05-30T16:00:00Z',
    createdAt: '2026-05-30T16:00:00Z'
  },
  {
    id: 'doc-5',
    sourceId: 'src-1',
    name: 'Research Notes.docx',
    relativePath: 'Notes/research_2026.docx',
    format: 'docx',
    indexStatus: 'pending',
    fileSize: 234567,
    lastModified: '2026-05-31T10:00:00Z',
    createdAt: '2026-05-31T10:00:00Z'
  }
];

export const mockSessions: Session[] = [
  {
    id: 'session-corpus',
    name: 'All Sources',
    mode: 'corpus',
    docIds: [],
    createdAt: '2026-05-01T00:00:00Z',
    lastMessageAt: '2026-05-31T11:45:00Z',
    messageCount: 45
  },
  {
    id: 'session-1',
    name: 'ML Study Session',
    mode: 'scoped',
    docIds: ['doc-1', 'doc-2'],
    createdAt: '2026-05-25T14:20:00Z',
    lastMessageAt: '2026-05-30T16:30:00Z',
    messageCount: 23
  },
  {
    id: 'session-2',
    name: 'Clean Code Review',
    mode: 'scoped',
    docIds: ['doc-3'],
    createdAt: '2026-05-28T09:15:00Z',
    lastMessageAt: '2026-05-29T18:00:00Z',
    messageCount: 12
  }
];

export const sampleCitations: Citation[] = [
  {
    docId: 'doc-1',
    docName: 'Machine Learning Fundamentals.pdf',
    pageStart: 44,
    pageEnd: 48,
    excerpt: 'Gradient descent is an optimization algorithm used to minimize some function by iteratively moving in the direction of steepest descent...',
    deepLink: '/viewer/doc-1?page=44'
  },
  {
    docId: 'doc-2',
    docName: 'Neural Networks Deep Dive.pdf',
    pageStart: 112,
    pageEnd: 115,
    excerpt: 'Backpropagation works by computing the gradient of the loss function with respect to each weight by the chain rule...',
    deepLink: '/viewer/doc-2?page=112'
  }
];

export const mockMessages: Message[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Explain gradient descent and how it relates to backpropagation in neural networks',
    timestamp: '2026-05-31T11:40:00Z'
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: `Gradient descent and backpropagation are fundamental concepts in training neural networks, working together to optimize model parameters.

**Gradient Descent** is an optimization algorithm that iteratively adjusts model weights to minimize a loss function. It works by:
1. Computing the gradient (derivative) of the loss function
2. Moving in the direction opposite to the gradient
3. Taking steps proportional to the learning rate

**Backpropagation** is the algorithm used to efficiently compute these gradients in neural networks. It applies the chain rule of calculus to propagate error signals backward through the network layers[1][2].

The relationship is crucial: backpropagation calculates *what* gradients to use, while gradient descent determines *how* to use those gradients to update weights. Without backpropagation, computing gradients for deep networks would be computationally infeasible[1].

**Key Steps:**
1. Forward pass: Input flows through network to produce prediction
2. Compute loss: Compare prediction to actual output
3. Backward pass (backpropagation): Calculate gradients layer by layer
4. Update weights: Apply gradient descent using computed gradients

This combination enables deep learning models to learn complex patterns from data efficiently[2].`,
    citations: sampleCitations,
    timestamp: '2026-05-31T11:41:23Z',
    highlights: [
      {
        id: 'hl-1',
        text: 'Gradient descent and backpropagation are fundamental concepts',
        color: 'yellow',
        startOffset: 0,
        endOffset: 62,
        createdAt: '2026-05-31T11:42:00Z'
      },
      {
        id: 'hl-2',
        text: 'backpropagation calculates what gradients to use, while gradient descent determines how to use those gradients',
        color: 'green',
        startOffset: 450,
        endOffset: 560,
        createdAt: '2026-05-31T11:43:15Z'
      }
    ],
    notes: [
      {
        id: 'note-1',
        content: 'Key insight: backprop computes the gradients, gradient descent uses them to update weights',
        offset: 450,
        createdAt: '2026-05-31T11:44:00Z'
      },
      {
        id: 'note-2',
        content: 'Remember the 4-step process for exam',
        offset: 720,
        createdAt: '2026-05-31T11:45:30Z'
      }
    ],
    comments: [
      {
        id: 'comment-1',
        content: 'This explanation is much clearer than the textbook version',
        offset: 100,
        createdAt: '2026-05-31T11:46:00Z'
      }
    ]
  }
];

export const mockAnnotations: Annotation[] = [
  {
    id: 'ann-1',
    sessionId: 'session-1',
    docId: 'doc-1',
    type: 'highlight',
    content: 'Important concept for understanding optimization',
    anchor: {
      page: 44,
      lineStart: 5,
      lineEnd: 12
    },
    createdAt: '2026-05-30T15:20:00Z'
  },
  {
    id: 'ann-2',
    sessionId: 'session-1',
    docId: 'doc-2',
    type: 'note',
    content: 'Review this section again - chain rule application is complex',
    anchor: {
      page: 113
    },
    createdAt: '2026-05-30T16:10:00Z'
  },
  {
    id: 'ann-3',
    sessionId: 'session-1',
    docId: 'doc-1',
    type: 'bookmark',
    content: 'Key algorithm explanation',
    anchor: {
      page: 47
    },
    createdAt: '2026-05-29T14:30:00Z'
  }
];
