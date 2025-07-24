import React, { useState, useEffect, useCallback } from 'react';
import { useEvents, ChimeraEvent } from '../contexts/EventContext';

interface Toast {
  id: string;
  agentName: string;
  message: string;
  timestamp: number;
}

const ToastManager: React.FC = () => {
  const { events } = useEvents();
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Auto-dismiss timer duration (8 seconds)
  const AUTO_DISMISS_DURATION = 8000;
  const MAX_VISIBLE_TOASTS = 3;

  const dismissToast = useCallback((toastId: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== toastId));
  }, []);

  useEffect(() => {
    // Process new error events
    const errorEvents = events.filter((event: ChimeraEvent) => event.type === 'error');
    
    if (errorEvents.length === 0) return;

    // Get the latest error event that hasn't been processed yet
    const latestErrorEvent = errorEvents[errorEvents.length - 1];
    
    // Check if we already have a toast for this exact event (by timestamp)
    const existingToast = toasts.find(toast => toast.timestamp === latestErrorEvent.ts);
    if (existingToast) return;

    // Create new toast
    const newToast: Toast = {
      id: `toast-${latestErrorEvent.ts}-${Math.random().toString(36).substr(2, 9)}`,
      agentName: latestErrorEvent.payload?.agent?.name || 'Unknown Agent',
      message: latestErrorEvent.payload?.message || 'An error occurred',
      timestamp: latestErrorEvent.ts
    };

    setToasts(prev => {
      // Add new toast and maintain max visible limit (FIFO)
      const updatedToasts = [...prev, newToast];
      return updatedToasts.length > MAX_VISIBLE_TOASTS 
        ? updatedToasts.slice(-MAX_VISIBLE_TOASTS)
        : updatedToasts;
    });

    // Set auto-dismiss timer
    const timer = setTimeout(() => {
      dismissToast(newToast.id);
    }, AUTO_DISMISS_DURATION);

    // Cleanup timer if component unmounts or toast is manually dismissed
    return () => clearTimeout(timer);
  }, [events, dismissToast]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div 
      className="fixed bottom-4 right-4 z-50 space-y-2 max-sm:left-4 max-sm:right-4"
      role="alert"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="bg-white border-l-4 border-red-500 rounded-lg shadow-lg p-4 min-w-80 max-sm:min-w-full flex items-start gap-3 transform transition-all duration-300 ease-in-out opacity-100 translate-x-0"
        >
          {/* Error Icon */}
          <div className="flex-shrink-0">
            <svg 
              className="w-5 h-5 text-red-500" 
              fill="currentColor" 
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path 
                fillRule="evenodd" 
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" 
                clipRule="evenodd" 
              />
            </svg>
          </div>

          {/* Toast Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {toast.agentName}
            </p>
            <p className="text-sm text-gray-600 mt-1 break-words">
              {toast.message}
            </p>
          </div>

          {/* Dismiss Button */}
          <button
            onClick={() => dismissToast(toast.id)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600 transition-colors"
            aria-label="Dismiss error notification"
          >
            <svg 
              className="w-4 h-4" 
              fill="currentColor" 
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path 
                fillRule="evenodd" 
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" 
                clipRule="evenodd" 
              />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
};

export default ToastManager;
