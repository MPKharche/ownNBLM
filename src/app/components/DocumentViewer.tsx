import { useState, useEffect } from 'react';
import { Document } from '../types';
import { api } from '../services/api';
import { X, FileText, Download, ExternalLink } from 'lucide-react';

interface DocumentViewerProps {
  docId: string;
  page?: number;
  onClose: () => void;
}

export function DocumentViewer({ docId, page, onClose }: DocumentViewerProps) {
  const [document, setDocument] = useState<Document | null>(null);
  const [currentPage, setCurrentPage] = useState(page || 1);

  useEffect(() => {
    loadDocument();
  }, [docId]);

  useEffect(() => {
    if (page) {
      setCurrentPage(page);
    }
  }, [page]);

  const loadDocument = async () => {
    const doc = await api.getDocument(docId);
    setDocument(doc);
  };

  if (!document) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-gray-500">Loading document...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <FileText className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-gray-900 truncate">{document.name}</h3>
            <div className="text-sm text-gray-500">
              {document.format.toUpperCase()}
              {document.pageCount && ` • ${document.pageCount} pages`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            title="Download"
          >
            <Download className="w-5 h-5 text-gray-600" />
          </button>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-md transition-colors"
            title="Close"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-hidden bg-gray-50 flex items-center justify-center">
        {document.format === 'pdf' ? (
          <div className="w-full h-full flex flex-col">
            {/* PDF Controls */}
            {document.pageCount && document.pageCount > 1 && (
              <div className="p-3 bg-white border-b border-gray-200 flex items-center justify-center gap-4">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="text-sm text-gray-700">
                  Page {currentPage} of {document.pageCount}
                </span>
                <button
                  onClick={() => setCurrentPage(Math.min(document.pageCount!, currentPage + 1))}
                  disabled={currentPage === document.pageCount}
                  className="px-3 py-1 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            )}

            {/* PDF Preview Placeholder */}
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <FileText className="w-24 h-24 mx-auto mb-4 text-gray-300" />
                <h4 className="text-lg font-medium text-gray-700 mb-2">PDF Viewer</h4>
                <p className="text-sm text-gray-600 mb-4">
                  In the full application, this will display the actual PDF content
                  using a PDF viewer library like react-pdf or pdf.js.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left">
                  <div className="text-xs font-medium text-blue-900 mb-1">
                    Current Page: {currentPage}
                  </div>
                  <div className="text-xs text-blue-700">
                    Document: {document.relativePath}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : document.format === 'md' ? (
          <div className="w-full h-full overflow-y-auto p-8">
            <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-sm p-8">
              <div className="prose prose-sm max-w-none">
                <h1>Markdown Document</h1>
                <p className="text-gray-600">
                  In the full application, this will render the actual markdown content
                  parsed from the file.
                </p>
                <h2>Features</h2>
                <ul>
                  <li>Full markdown rendering with syntax highlighting</li>
                  <li>Support for tables, lists, and code blocks</li>
                  <li>Line-level anchoring for citations</li>
                  <li>Search and highlighting capabilities</li>
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center max-w-md">
            <FileText className="w-24 h-24 mx-auto mb-4 text-gray-300" />
            <h4 className="text-lg font-medium text-gray-700 mb-2">
              {document.format.toUpperCase()} Document
            </h4>
            <p className="text-sm text-gray-600">
              Preview for {document.format} files will be available in the full application.
            </p>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="flex gap-3">
          <button className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            Add Note
          </button>
          <button className="flex-1 px-4 py-2 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-sm flex items-center justify-center gap-2">
            <ExternalLink className="w-4 h-4" />
            Open External
          </button>
        </div>
      </div>
    </div>
  );
}
