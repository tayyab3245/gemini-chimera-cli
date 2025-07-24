import React, { createContext, useContext, ReactNode } from 'react';

interface WebSocketContextType {
  ws: WebSocket | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

export const useWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
};

interface WebSocketProviderProps {
  children: ReactNode;
  ws: WebSocket | null;
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ 
  children, 
  ws, 
  connectionStatus 
}) => {
  return (
    <WebSocketContext.Provider value={{ ws, connectionStatus }}>
      {children}
    </WebSocketContext.Provider>
  );
};
