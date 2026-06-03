import { useEffect, useState } from 'react';
import { storage } from '../services/storage';

/**
 * Hook to sync data across app and browser tabs
 * Listens to localStorage changes and triggers re-renders
 */
export function useStorageSync() {
  const [syncTrigger, setSyncTrigger] = useState(0);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      // Only react to changes in our app's storage keys (cross-tab)
      if (e.key && e.key.startsWith('ownnblm_')) {
        setSyncTrigger(prev => prev + 1);
      }
    };

    const handleCustomStorageChange = (e: Event) => {
      // Handle same-tab storage changes
      const customEvent = e as CustomEvent;
      if (customEvent.detail?.key?.startsWith('ownnblm_')) {
        setSyncTrigger(prev => prev + 1);
      }
    };

    // Listen to storage events (cross-tab sync)
    window.addEventListener('storage', handleStorageChange);

    // Listen to custom events (same-tab sync)
    window.addEventListener('ownnblm-storage-change', handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('ownnblm-storage-change', handleCustomStorageChange);
    };
  }, []);

  return syncTrigger;
}

/**
 * Hook to get messages for a session with auto-sync
 */
export function useSessionMessages(sessionId: string) {
  const syncTrigger = useStorageSync();
  const [messages, setMessages] = useState(() => storage.getSessionMessages(sessionId));

  useEffect(() => {
    setMessages(storage.getSessionMessages(sessionId));
  }, [sessionId, syncTrigger]);

  return messages;
}
