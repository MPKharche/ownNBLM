import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CollapsibleSidebarProps {
  side: 'left' | 'right';
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  width?: string;
}

export function CollapsibleSidebar({
  side,
  isOpen,
  onToggle,
  children,
  width = '280px'
}: CollapsibleSidebarProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <>
      {/* Sidebar */}
      <div
        className={`fixed ${side === 'left' ? 'left-0' : 'right-0'} top-0 h-full bg-background border-${side === 'left' ? 'r' : 'l'} border-border transition-transform duration-300 ease-in-out z-40 ${
          isOpen ? 'translate-x-0' : side === 'left' ? '-translate-x-full' : 'translate-x-full'
        }`}
        style={{ width }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {children}

        {/* Toggle Button - Always Visible on Sidebar */}
        <button
          onClick={onToggle}
          className={`absolute top-1/2 -translate-y-1/2 ${
            side === 'left' ? '-right-3' : '-left-3'
          } w-6 h-12 bg-card border border-border rounded-md shadow-sm hover:bg-accent transition-all flex items-center justify-center ${
            isHovered ? 'opacity-100' : 'opacity-60'
          }`}
        >
          {side === 'left' ? (
            isOpen ? <ChevronLeft className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />
          ) : (
            isOpen ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronLeft className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Trigger Area - When Sidebar is Closed */}
      {!isOpen && (
        <div
          className={`fixed ${side === 'left' ? 'left-0' : 'right-0'} top-0 h-full w-1 hover:w-8 bg-transparent hover:bg-muted/50 transition-all z-30 cursor-pointer group`}
          onClick={onToggle}
        >
          <div className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-1' : 'right-1'} opacity-0 group-hover:opacity-100 transition-opacity`}>
            <div className="w-6 h-12 bg-card border border-border rounded-md shadow-sm flex items-center justify-center">
              {side === 'left' ? (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
