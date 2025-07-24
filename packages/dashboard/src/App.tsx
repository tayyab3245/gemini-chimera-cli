import React, { useState } from 'react';
import EventStream from './components/EventStream';
import ControlPanel from './components/ControlPanel';
import EventTimeline from './components/EventTimeline';
import ProgressBar from './components/ProgressBar';
import ToastManager from './components/ToastManager';
import AgentStatusBar from './components/AgentStatusBar';
import TimelineFilterBar from './components/TimelineFilterBar';
import ChatPanel from './components/ChatPanel';
import ThemeToggle from './components/ThemeToggle';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { EventProvider } from './contexts/EventContext';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  return (
    <WebSocketProvider ws={ws} connectionStatus={connectionStatus}>
      <EventProvider ws={ws}>
        <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-200 flex flex-col">
          {/* Global header */}
          <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center h-16">
                <div className="flex items-center">
                  <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Chimera Live Dashboard
                  </h1>
                  <span className="ml-3 px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                    Real-time
                  </span>
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>

          {/* Main content grid */}
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex-1">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full">
              
              {/* Primary Chat Column - Takes 2/3 width on large screens */}
              <div className="lg:col-span-2 flex flex-col order-1 lg:order-1">
                <div className="mb-4">
                  <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                    Kernel Chat
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Interactive conversation with your workflow agents
                  </p>
                </div>
                
                {/* Chat panel takes available height - minimum height on mobile */}
                <div className="flex-1 overflow-hidden min-h-[400px] lg:min-h-0">
                  <ChatPanel />
                </div>
              </div>

              {/* Supporting panels column - Takes 1/3 width on large screens */}
              <div className="flex flex-col space-y-6 order-2 lg:order-2">
                
                {/* Agent Status & Progress - Always visible */}
                <div className="space-y-4">
                  <AgentStatusBar />
                  <ProgressBar />
                </div>

                {/* Controls */}
                <ControlPanel />

                {/* Event Timeline - Expandable section */}
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="mb-3">
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                      Event Timeline
                    </h3>
                    <TimelineFilterBar />
                  </div>
                  
                  {/* Timeline takes remaining space - minimum height on mobile */}
                  <div className="flex-1 overflow-hidden min-h-[300px] lg:min-h-0">
                    <EventTimeline />
                  </div>
                </div>

                {/* Hidden EventStream for connection management */}
                <div className="hidden">
                  <EventStream 
                    ws={ws}
                    connectionStatus={connectionStatus}
                    onWebSocketChange={setWs}
                    onConnectionStatusChange={setConnectionStatus}
                  />
                </div>
              </div>
            </div>
          </main>

          {/* Footer */}
          <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 mt-auto">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
              <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                Chimera CLI Dashboard - Powered by React, Vite & Tailwind CSS
              </p>
            </div>
          </footer>
        </div>
        
        {/* Toast notifications overlay */}
        <ToastManager />
      </EventProvider>
    </WebSocketProvider>
  );
}

export default App;
