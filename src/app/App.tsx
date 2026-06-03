import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { SessionsMenu } from './components/SessionsMenu';
import { SourcesPanel } from './components/SourcesPanel';
import { ImmersiveChatInterface } from './components/ImmersiveChatInterface';
import { AnnotationsPanel } from './components/AnnotationsPanel';
import { CompactDocumentViewer } from './components/CompactDocumentViewer';
import { CollapsibleSidebar } from './components/CollapsibleSidebar';
import { Settings } from './components/Settings';
import { useImmersiveMode } from './hooks/useImmersiveMode';
import { api } from './services/api';
import {
  Home,
  Settings as SettingsIcon,
  BookOpen,
  Minimize2,
  X,
  LogOut,
  User,
  ChevronDown,
  MessageSquare,
  FolderOpen
} from 'lucide-react';

function UserMenu() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-accent transition-all"
      >
        <div className="w-7 h-7 bg-primary rounded-full flex items-center justify-center">
          {user?.avatar ? (
            <img src={user.avatar} alt={user.name} className="w-full h-full rounded-full" />
          ) : (
            <User className="w-4 h-4 text-primary-foreground" />
          )}
        </div>
        <span className="text-sm font-medium text-foreground hidden sm:inline">{user?.name}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border rounded-xl shadow-xl animate-scale-in z-50">
          <div className="p-3 border-b border-border">
            <div className="text-sm font-medium text-foreground">{user?.name}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
          </div>
          <button
            onClick={() => {
              logout();
              setIsOpen(false);
            }}
            className="w-full px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10 transition-colors flex items-center gap-2 rounded-b-xl"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      )}

      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}

function MainLayout() {
  const navigate = useNavigate();
  const [currentSessionId, setCurrentSessionId] = useState('session-corpus');
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>('system');
  const [showSessionsMenu, setShowSessionsMenu] = useState(true);

  const {
    state,
    openDocument,
    closeDocument,
    toggleSidebar,
    toggleSessionPanel,
    enterImmersiveMode,
    exitImmersiveMode
  } = useImmersiveMode();

  // Load and apply theme
  useEffect(() => {
    const loadTheme = async () => {
      const settings = await api.getSettings();
      setTheme(settings.theme);
      applyTheme(settings.theme);
    };
    loadTheme();
  }, []);

  const applyTheme = (themeValue: 'light' | 'dark' | 'system') => {
    const root = document.documentElement;

    if (themeValue === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.toggle('dark', systemTheme === 'dark');
    } else {
      root.classList.toggle('dark', themeValue === 'dark');
    }
  };

  const handleViewDocument = (docId: string, page?: number) => {
    openDocument(docId, page);
  };

  const handleStartChat = () => {
    enterImmersiveMode();
  };

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
  };

  const hasMessages = true;

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Modern Top Bar - Only in Non-Immersive Mode */}
      {!state.isImmersive && (
        <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-primary to-primary-hover rounded-lg flex items-center justify-center shadow-md">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-primary-hover bg-clip-text text-transparent">
              ownNBLM
            </h1>
          </div>

          <nav className="flex items-center gap-2">
            <button
              onClick={() => setShowSessionsMenu(!showSessionsMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-all text-foreground text-sm font-medium"
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Sessions</span>
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-all text-foreground text-sm font-medium"
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-all text-foreground text-sm font-medium"
            >
              <SettingsIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Settings</span>
            </button>
            <UserMenu />
          </nav>
        </header>
      )}

      {/* Floating Exit Button - Only Visible in Immersive Mode */}
      {state.isImmersive && (
        <div className="fixed top-4 right-4 z-50 animate-fade-in">
          <button
            onClick={exitImmersiveMode}
            className="p-3 bg-card hover:bg-accent border border-border rounded-xl shadow-xl transition-all group"
            title="Exit reading mode"
          >
            <Minimize2 className="w-5 h-5 text-muted-foreground group-hover:text-foreground" />
          </button>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden relative">
        <Routes>
          <Route
            path="/"
            element={
              <>
                {/* Sessions Menu - Collapsible */}
                {showSessionsMenu && (
                  <div className="w-64 border-r border-border flex-shrink-0 animate-slide-in-left">
                    <SessionsMenu
                      currentSessionId={currentSessionId}
                      onSessionSelect={handleSessionSelect}
                    />
                  </div>
                )}

                {/* Left Sidebar - Sources */}
                <CollapsibleSidebar
                  side="left"
                  isOpen={state.showSidebar}
                  onToggle={toggleSidebar}
                  width="280px"
                >
                  <SourcesPanel />
                </CollapsibleSidebar>

                {/* Main Chat Area */}
                <div
                  className={`flex-1 flex transition-all duration-300 ${
                    state.showSidebar ? 'ml-[280px]' : 'ml-0'
                  } ${
                    state.showSessionPanel ? 'mr-[320px]' : 'mr-0'
                  }`}
                >
                  {!state.viewingDocId ? (
                    /* Full Width Chat */
                    <div className="flex-1 bg-background">
                      <ImmersiveChatInterface
                        sessionId={currentSessionId}
                        onViewDocument={handleViewDocument}
                      />
                    </div>
                  ) : (
                    /* Split Screen: Chat + Document */
                    <>
                      <div className="flex-1 border-r border-border bg-background">
                        <ImmersiveChatInterface
                          sessionId={currentSessionId}
                          onViewDocument={handleViewDocument}
                        />
                      </div>
                      <div className="flex-1 bg-background relative">
                        {/* Close Document Button */}
                        <button
                          onClick={closeDocument}
                          className="absolute top-3 right-3 z-10 p-2 bg-card hover:bg-destructive hover:text-destructive-foreground border border-border rounded-lg shadow-md transition-all"
                          title="Close document"
                        >
                          <X className="w-4 h-4" />
                        </button>
                        <CompactDocumentViewer
                          docId={state.viewingDocId}
                          page={state.viewingPage}
                          onClose={closeDocument}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Right Sidebar - Annotations */}
                <CollapsibleSidebar
                  side="right"
                  isOpen={state.showSessionPanel}
                  onToggle={toggleSessionPanel}
                  width="320px"
                >
                  <AnnotationsPanel sessionId={currentSessionId} />
                </CollapsibleSidebar>
              </>
            }
          />
          <Route
            path="/settings"
            element={
              <div className="flex-1 overflow-auto animate-fade-in">
                <Settings onThemeChange={applyTheme} />
              </div>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {/* Modern Footer - Only in Non-Immersive Mode */}
      {!state.isImmersive && (
        <footer className="bg-card border-t border-border px-4 py-2 flex-shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>© 2026 ownNBLM</span>
              <span>•</span>
              <span>Knowledge Made Personal</span>
            </div>
            {hasMessages && (
              <button
                onClick={handleStartChat}
                className="flex items-center gap-1.5 px-3 py-1.5 text-primary hover:text-primary-hover transition-colors rounded-lg hover:bg-primary/10 font-medium"
              >
                <Minimize2 className="w-3.5 h-3.5" />
                Reading Mode
              </button>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AuthGuard>
          <MainLayout />
        </AuthGuard>
      </AuthProvider>
    </BrowserRouter>
  );
}
