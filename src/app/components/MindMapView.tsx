import { useState, useRef, useEffect } from 'react';
import { MindMapNode, Message } from '../types';
import { Download, Plus, Maximize2, Minimize2 } from 'lucide-react';

interface MindMapViewProps {
  sessionId: string;
  messages: Message[];
}

export function MindMapView({ sessionId, messages }: MindMapViewProps) {
  const [nodes, setNodes] = useState<MindMapNode[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    generateMindMapFromMessages();
  }, [messages]);

  const generateMindMapFromMessages = () => {
    // Auto-generate mind map nodes from conversation
    const rootNode: MindMapNode = {
      id: 'root',
      content: 'Session Overview',
      position: { x: 400, y: 50 },
      children: []
    };

    const generatedNodes: MindMapNode[] = [rootNode];

    // Create nodes from key messages
    messages.forEach((msg, idx) => {
      if (msg.role === 'user') {
        const node: MindMapNode = {
          id: `msg-${msg.id}`,
          content: msg.content.substring(0, 50) + '...',
          messageId: msg.id,
          position: {
            x: 200 + (idx % 3) * 250,
            y: 150 + Math.floor(idx / 3) * 100
          },
          children: [],
          color: 'blue'
        };
        generatedNodes.push(node);
        rootNode.children.push(node);
      }
    });

    setNodes(generatedNodes);
  };

  const exportMindMap = () => {
    let markdown = `# Mind Map: Session ${sessionId}\n\n`;

    const renderNode = (node: MindMapNode, level: number = 0): string => {
      const indent = '  '.repeat(level);
      let md = `${indent}- **${node.content}**\n`;

      if (node.messageId) {
        md += `${indent}  _(From message: ${node.messageId})_\n`;
      }

      node.children.forEach(child => {
        md += renderNode(child, level + 1);
      });

      return md;
    };

    nodes.forEach(node => {
      if (node.id === 'root') {
        markdown += renderNode(node);
      }
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mindmap-${sessionId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`${isFullscreen ? 'fixed inset-0 z-50' : 'relative h-96'} bg-background border border-border rounded-lg`}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-2 bg-card border-b border-border flex items-center justify-between z-10">
        <h3 className="text-sm font-medium text-foreground">Mind Map</h3>
        <div className="flex gap-1">
          <button
            onClick={exportMindMap}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title="Export mind map"
          >
            <Download className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 hover:bg-accent rounded transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Maximize2 className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="w-full h-full pt-12 overflow-auto">
        <div className="min-w-full min-h-full p-8">
          {nodes.map(node => (
            <div
              key={node.id}
              className="absolute p-3 bg-card border-2 border-blue-500 dark:border-blue-400 rounded-lg shadow-md min-w-[150px] max-w-[200px]"
              style={{
                left: `${node.position.x}px`,
                top: `${node.position.y}px`
              }}
            >
              <div className="text-sm font-medium text-foreground">
                {node.content}
              </div>
              {node.messageId && (
                <div className="text-xs text-muted-foreground mt-1">
                  Message ref
                </div>
              )}
            </div>
          ))}

          {/* Empty state */}
          {nodes.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <div className="text-4xl mb-2">🗺️</div>
                <p className="text-sm">Start chatting to build your mind map</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
