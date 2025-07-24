import React, { createContext, useContext, ReactNode, useState, useEffect } from 'react';

export interface ChimeraEvent {
  ts: number;
  type: string;
  payload: any;
}

interface EventContextType {
  events: ChimeraEvent[];
  clearEvents: () => void;
}

const EventContext = createContext<EventContextType | undefined>(undefined);

export const useEvents = () => {
  const context = useContext(EventContext);
  if (context === undefined) {
    throw new Error('useEvents must be used within an EventProvider');
  }
  return context;
};

interface EventProviderProps {
  children: ReactNode;
  ws: WebSocket | null;
}

export const EventProvider: React.FC<EventProviderProps> = ({ children, ws }) => {
  const [events, setEvents] = useState<ChimeraEvent[]>([]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const eventData: ChimeraEvent = JSON.parse(event.data);
        setEvents(prev => [...prev, eventData]);
      } catch (error) {
        console.error('Failed to parse event data:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws]);

  const clearEvents = () => {
    setEvents([]);
  };

  return (
    <EventContext.Provider value={{ events, clearEvents }}>
      {children}
    </EventContext.Provider>
  );
};
