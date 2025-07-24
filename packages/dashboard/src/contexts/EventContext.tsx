import React, { createContext, useContext, ReactNode, useState, useEffect, useMemo } from 'react';

export interface ChimeraEvent {
  ts: number;
  type: string;
  payload: any;
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
    <EventContext.Provider value={{ events, filteredEvents, filters, setFilters, clearEvents }}>
      {children}
    </EventContext.Provider>
  );
};
