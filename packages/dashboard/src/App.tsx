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
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
          {/* Main content area */}
          <div className="flex-1 py-8 px-4">
            <div className="max-w-6xl mx-auto">
              {/* Header with theme toggle */}
              <header className="text-center mb-8 relative">
                {/* Theme toggle positioned absolutely in top-right */}
                <div className="absolute top-0 right-0">
                  <ThemeToggle />
                </div>
                
                <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  Chimera Live Dashboard
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-400">
                  Real-time monitoring of workflow agents and events
                </p>
              </header>
              
              <main className="space-y-8">
                <AgentStatusBar />
                <ProgressBar />
                <ControlPanel />
                <TimelineFilterBar />
                <EventTimeline />
                <EventStream 
                  ws={ws}
                  connectionStatus={connectionStatus}
                  onWebSocketChange={setWs}
                  onConnectionStatusChange={setConnectionStatus}
                />
              </main>
              
              <footer className="mt-8 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>Chimera CLI Dashboard - Built with React + Vite</p>
              </footer>
            </div>
          </div>
          
          {/* Chat panel on the right */}
          <div className="w-96 flex-shrink-0">
            <ChatPanel />
          </div>
        </div>
        
        {/* Toast notifications for errors */}
        <ToastManager />
      </EventProvider>
    </WebSocketProvider>
  );
}

export default App;
