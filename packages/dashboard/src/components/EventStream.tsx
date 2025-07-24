import React, { useEffect, useRef } from 'react';
import { useEvents, ChimeraEvent } from '../contexts/EventContext';

interface EventStreamProps {
  ws: WebSocket | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  onWebSocketChange: (ws: WebSocket | null) => void;
  onConnectionStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
}

const EventStream: React.FC<EventStreamProps> = ({ 
  ws, 
  connectionStatus, 
  onWebSocketChange, 
  onConnectionStatusChange 
}) => {
  const { events, clearEvents } = useEvents();
  const eventsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [events]);

  const formatTimestamp = (ts: number) => {
    return new Date(ts).toLocaleTimeString();
  };

  const formatPayload = (payload: any) => {
    const jsonStr = JSON.stringify(payload, null, 0);
    return jsonStr.length > 120 ? jsonStr.substring(0, 120) + '...' : jsonStr;
  };

  const getEventTypeColor = (type: string) => {
    switch (type) {
      case 'agent-start': return 'text-blue-600 bg-blue-50';
      case 'agent-end': return 'text-blue-800 bg-blue-100';
      case 'progress': return 'text-green-600 bg-green-50';
      case 'error': return 'text-red-600 bg-red-50';
      case 'log': return 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700';
      case 'workflow-start': return 'text-purple-600 bg-purple-50';
      case 'workflow-complete': return 'text-purple-800 bg-purple-100';
      default: return 'text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700';
    }
  };

  useEffect(() => {
    const connect = () => {
      onConnectionStatusChange('connecting');
      const newWs = new WebSocket('ws://localhost:4000/events');
      onWebSocketChange(newWs);

      newWs.onopen = () => {
        console.log('Connected to WebSocket');
        onConnectionStatusChange('connected');
      };

      newWs.onclose = () => {
        console.log('WebSocket connection closed');
        onConnectionStatusChange('disconnected');
        onWebSocketChange(null);
        
        // Attempt to reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      newWs.onerror = (error) => {
        console.error('WebSocket error:', error);
        onConnectionStatusChange('disconnected');
      };
    };

    if (!ws) {
      connect();
    }

    return () => {
      if (ws) {
        ws.close();
      }
    };
  }, [ws, onWebSocketChange, onConnectionStatusChange]);

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600 bg-green-100';
      case 'connecting': return 'text-yellow-600 bg-yellow-100';
      case 'disconnected': return 'text-red-600 bg-red-100';
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Live Event Stream</h2>
        <div className="flex items-center gap-4">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${getConnectionStatusColor()}`}>
            {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
          </span>
          <button
            onClick={clearEvents}
            className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Clear Events
          </button>
        </div>
      </div>
      
      <div className="h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-gray-50 dark:bg-gray-800">
        {events.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <p>No events yet. Waiting for WebSocket connection...</p>
            <p className="text-sm mt-2">Make sure the WebSocket gateway is running on ws://localhost:4000/events</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {events.map((event: ChimeraEvent, index: number) => (
              <li key={index} className={`p-3 rounded-md border-l-4 ${getEventTypeColor(event.type)}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className="font-mono text-xs text-gray-500 dark:text-gray-400">
                        {formatTimestamp(event.ts)}
                      </span>
                      <span className="font-semibold text-sm">
                        {event.type}
                      </span>
                    </div>
                    <div className="font-mono text-xs text-gray-700 break-all">
                      {formatPayload(event.payload)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div ref={eventsEndRef} />
      </div>
      
      <div className="mt-4 text-sm text-gray-600">
        <p>Total events: {events.length}</p>
        <p>WebSocket URL: ws://localhost:4000/events</p>
      </div>
    </div>
  );
};

export default EventStream;
