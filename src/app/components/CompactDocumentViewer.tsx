import { useState, useEffect, useRef } from 'react';
import { Document } from '../types';
import { api } from '../services/api';
import { Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface CompactDocumentViewerProps {
  docId: string;
  page?: number;
  onClose: () => void;
}

export function CompactDocumentViewer({ docId, page, onClose }: CompactDocumentViewerProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [currentPage, setCurrentPage] = useState(page || 1);
  const [zoom, setZoom] = useState(100);
  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDocument();
  }, [docId]);

  useEffect(() => {
    if (page) {
      setCurrentPage(page);
      setTimeout(() => {
        viewerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    }
  }, [page]);

  const loadDocument = async () => {
    const doc = await api.getDocument(docId);
    setDocument(doc);
  };

  if (!document) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-muted/30">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-2 py-1.5 bg-card border-b border-border">
        <div className="flex-1 min-w-0 mr-2">
          <div className="text-sm font-medium text-foreground truncate">{document.name}</div>
          <div className="text-xs text-muted-foreground">
            {document.format.toUpperCase()}
            {document.pageCount && ` • ${document.pageCount} pages`}
          </div>
        </div>
        <button
          className="p-1 hover:bg-accent rounded transition-colors"
          title="Download"
        >
          <Download className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Compact Controls */}
      {document.pageCount && document.pageCount > 1 && (
        <div className="flex items-center justify-between px-2 py-1 bg-card border-b border-border">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-1 hover:bg-accent rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <span className="text-xs text-foreground px-2">
              {currentPage} / {document.pageCount}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(document.pageCount!, currentPage + 1))}
              disabled={currentPage === document.pageCount}
              className="p-1 hover:bg-accent rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom(Math.max(50, zoom - 10))}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Zoom out"
            >
              <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
            <span className="text-xs text-muted-foreground px-1">{zoom}%</span>
            <button
              onClick={() => setZoom(Math.min(200, zoom + 10))}
              className="p-1 hover:bg-accent rounded transition-colors"
              title="Zoom in"
            >
              <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Document Viewer */}
      <div
        ref={viewerRef}
        className="flex-1 overflow-auto bg-muted/30"
        style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
      >
        {document.format === 'pdf' ? (
          <div className="min-h-full flex items-start justify-center p-4">
            <div className="bg-card shadow-lg" style={{ width: '8.5in', minHeight: '11in' }}>
              <div className="w-full h-full flex items-center justify-center p-8">
                <div className="text-center max-w-md">
                  <div className="text-sm text-muted-foreground mb-2">
                    Page {currentPage} Preview
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded p-4 text-left">
                    <div className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                      PDF Viewer Integration
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                      <div>• Full PDF rendering with react-pdf</div>
                      <div>• Text selection and highlighting</div>
                      <div>• Auto-scroll to cited paragraphs</div>
                      <div>• Synchronized with chat citations</div>
                    </div>
                  </div>
                  {page && (
                    <div className="mt-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3 text-xs text-green-800 dark:text-green-200">
                      ✓ Scrolled to cited page: {page}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : document.format === 'md' ? (
          <div className="max-w-4xl mx-auto bg-card shadow-lg p-6 my-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <h1>Markdown Document</h1>
              <p className="text-muted-foreground">
                Rendered markdown content with proper formatting, syntax highlighting, and anchor navigation.
              </p>
              {page && (
                <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded p-3 my-4">
                  <div className="text-sm text-green-800 dark:text-green-200">
                    ✓ Scrolled to line {page}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="min-h-full flex items-center justify-center p-8">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">
                Preview for {document.format.toUpperCase()} files
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
