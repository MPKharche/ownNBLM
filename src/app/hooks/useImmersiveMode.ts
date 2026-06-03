import { useState, useCallback } from 'react';

export interface ImmersiveModeState {
  isImmersive: boolean;
  viewingDocId: string | null;
  viewingPage?: number;
  showSidebar: boolean;
  showSessionPanel: boolean;
}

export function useImmersiveMode() {
  const [state, setState] = useState<ImmersiveModeState>({
    isImmersive: false,
    viewingDocId: null,
    viewingPage: undefined,
    showSidebar: false,
    showSessionPanel: false
  });

  const enterImmersiveMode = useCallback(() => {
    setState(prev => ({
      ...prev,
      isImmersive: true,
      showSidebar: false,
      showSessionPanel: false
    }));
  }, []);

  const exitImmersiveMode = useCallback(() => {
    setState({
      isImmersive: false,
      viewingDocId: null,
      viewingPage: undefined,
      showSidebar: true,
      showSessionPanel: true
    });
  }, []);

  const openDocument = useCallback((docId: string, page?: number) => {
    setState(prev => ({
      ...prev,
      isImmersive: true,
      viewingDocId: docId,
      viewingPage: page,
      showSidebar: false,
      showSessionPanel: false
    }));
  }, []);

  const closeDocument = useCallback(() => {
    setState(prev => ({
      ...prev,
      viewingDocId: null,
      viewingPage: undefined
    }));
  }, []);

  const toggleSidebar = useCallback(() => {
    setState(prev => ({ ...prev, showSidebar: !prev.showSidebar }));
  }, []);

  const toggleSessionPanel = useCallback(() => {
    setState(prev => ({ ...prev, showSessionPanel: !prev.showSessionPanel }));
  }, []);

  return {
    state,
    enterImmersiveMode,
    exitImmersiveMode,
    openDocument,
    closeDocument,
    toggleSidebar,
    toggleSessionPanel
  };
}
