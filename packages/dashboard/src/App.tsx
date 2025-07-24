import React, { useState } from 'react';
import EventStream from './components/EventStream';
import ControlPanel from './components/ControlPanel';
import EventTimeline from './components/EventTimeline';
import ProgressBar from './components/ProgressBar';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { EventProvider } from './contexts/EventContext';

function App() {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');

  return (
    <WebSocketProvider ws={ws} connectionStatus={connectionStatus}>
      <EventProvider ws={ws}>
        <div className="min-h-screen bg-gray-100 py-8 px-4">
          <div className="max-w-6xl mx-auto">
            <header className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Chimera Live Dashboard
              </h1>
              <p className="text-lg text-gray-600">
                Real-time monitoring of workflow agents and events
              </p>
            </header>
            
            <main className="space-y-8">
              <ProgressBar />
              <ControlPanel />
              <EventTimeline />
              <EventStream 
                ws={ws}
                connectionStatus={connectionStatus}
                onWebSocketChange={setWs}
                onConnectionStatusChange={setConnectionStatus}
              />
            </main>
            
            <footer className="mt-8 text-center text-sm text-gray-500">
              <p>Chimera CLI Dashboard - Built with React + Vite</p>
            </footer>
          </div>
        </div>
      </EventProvider>
    </WebSocketProvider>
  );
}

export default App;
