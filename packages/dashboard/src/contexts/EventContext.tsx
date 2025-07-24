import React, { createContext, useContext, ReactNode, useState, useEffect, useMemo, useCallback } from 'react';

export interface ChimeraEvent {
  ts: number;
  type: string;
  payload: any;
}

export interface ChatMessage {
  id: string;
  timestamp: number;
  text: string;
  sender: 'user' | 'kernel';
}

export interface FilterState {
  query: string;
  agents: {
    KERNEL: boolean;
    SYNTH: boolean;
    DRIVE: boolean;
    AUDIT: boolean;
  };
  eventTypes: {
    log: boolean;
    progress: boolean;
    'agent-start': boolean;
    'agent-end': boolean;
    error: boolean;
  };
}

interface EventContextType {
  events: ChimeraEvent[];
  filteredEvents: ChimeraEvent[];
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  clearEvents: () => void;
  chatMessages: ChatMessage[];
  addChatMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  sendChatMessage: (text: string) => void;
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
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    // Load chat messages from localStorage
    const saved = localStorage.getItem('chimera-chat-messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed.slice(-50) : [];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [filters, setFilters] = useState<FilterState>({
    query: '',
    agents: {
      KERNEL: true,
      SYNTH: true,
      DRIVE: true,
      AUDIT: true,
    },
    eventTypes: {
      log: true,
      progress: true,
      'agent-start': true,
      'agent-end': true,
      error: true,
    },
  });

  // Save chat messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chimera-chat-messages', JSON.stringify(chatMessages.slice(-50)));
  }, [chatMessages]);

  const addChatMessage = useCallback((message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      ...message
    };
    
    setChatMessages(prev => {
      const updated = [...prev, newMessage];
      return updated.slice(-50); // Keep only last 50 messages
    });
  }, []);

  const sendChatMessage = useCallback((text: string) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected, cannot send chat message');
      return;
    }

    // Add user message to chat
    addChatMessage({ text, sender: 'user' });

    // Send to WebSocket
    try {
      ws.send(JSON.stringify({ action: 'chat', text }));
    } catch (error) {
      console.error('Failed to send chat message:', error);
    }
  }, [ws, addChatMessage]);

  useEffect(() => {
    if (!ws) return;

    const handleMessage = (event: MessageEvent) => {
      try {
        const eventData: ChimeraEvent = JSON.parse(event.data);
        setEvents(prev => [...prev, eventData]);

        // If this is a KERNEL log event, add it to chat
        if (eventData.type === 'log' && eventData.payload?.agent === 'KERNEL') {
          const text = eventData.payload.text || eventData.payload.message || JSON.stringify(eventData.payload);
          addChatMessage({ text, sender: 'kernel' });
        }
      } catch (error) {
        console.error('Failed to parse event data:', error);
      }
    };

    ws.addEventListener('message', handleMessage);

    return () => {
      ws.removeEventListener('message', handleMessage);
    };
  }, [ws, addChatMessage]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      // Apply query filter
      if (filters.query) {
        const query = filters.query.toLowerCase();
        const payloadString = JSON.stringify(event.payload).toLowerCase();
        const typeString = event.type.toLowerCase();
        
        if (!payloadString.includes(query) && !typeString.includes(query)) {
          return false;
        }
      }

      // Apply event type filter - if the event type is not in our filters, allow it by default
      const eventTypeFilter = filters.eventTypes[event.type as keyof typeof filters.eventTypes];
      if (eventTypeFilter !== undefined && !eventTypeFilter) {
        return false;
      }

      // Apply agent filter
      if (event.payload?.agent) {
        const agent = event.payload.agent as keyof typeof filters.agents;
        if (filters.agents[agent] !== undefined && !filters.agents[agent]) {
          return false;
        }
      }

      return true;
    });
  }, [events, filters]);

  const clearEvents = () => {
    setEvents([]);
  };

  return (
    <EventContext.Provider value={{ 
      events, 
      filteredEvents, 
      filters, 
      setFilters, 
      clearEvents,
      chatMessages,
      addChatMessage,
      sendChatMessage
    }}>
      {children}
    </EventContext.Provider>
  );
};
