import React, { useEffect, useRef, useState } from 'react';
import { useEvents, ChimeraEvent } from '../contexts/EventContext';
import AgentAvatar, { AgentType, AgentState } from './AgentAvatar';

const EventTimeline: React.FC = () => {
  const { events, filteredEvents } = useEvents();
  const timelineEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const getEventSummary = (event: ChimeraEvent): string => {
    let summary = '';
    
    switch (event.type) {
      case 'agent-start':
        summary = `Agent started: ${event.payload?.agent || 'Unknown'}`;
        break;
      case 'agent-end':
        summary = `Agent completed: ${event.payload?.agent || 'Unknown'}`;
        break;
      case 'progress':
        summary = `Progress: ${event.payload?.percentage || 0}%`;
        break;
      case 'error':
        summary = `Error: ${event.payload?.message || event.payload?.error || 'Unknown error'}`;
        break;
      case 'log':
        summary = `Log: ${event.payload?.message || JSON.stringify(event.payload)}`;
        break;
      case 'workflow-start':
        summary = `Workflow started: ${event.payload?.workflow || 'Unknown'}`;
        break;
      case 'workflow-complete':
        summary = `Workflow completed: ${event.payload?.workflow || 'Unknown'}`;
        break;
      default:
        summary = `${event.type}: ${JSON.stringify(event.payload)}`;
        break;
    }

    return summary.length > 120 ? summary.substring(0, 120) + '...' : summary;
  };

  const getEventTypeColor = (type: string): string => {
    switch (type) {
      case 'agent-start': return 'bg-blue-500 text-white';
      case 'agent-end': return 'bg-blue-700 text-white';
      case 'progress': return 'bg-green-500 text-white';
      case 'error': return 'bg-red-500 text-white';
      case 'log': return 'bg-gray-500 text-white';
      case 'workflow-start': return 'bg-purple-500 text-white';
      case 'workflow-complete': return 'bg-purple-700 text-white';
      default: return 'bg-gray-400 text-white';
    }
  };

  const getAgentName = (event: ChimeraEvent): string | null => {
    if (event.payload?.agent) {
      return event.payload.agent;
    }
    return null;
  };

  const getAgentFromEvent = (event: ChimeraEvent): AgentType | null => {
    const agentName = getAgentName(event);
    if (!agentName) return null;
    
    const upperAgent = agentName.toUpperCase();
    if (['KERNEL', 'SYNTH', 'DRIVE', 'AUDIT'].includes(upperAgent)) {
      return upperAgent as AgentType;
    }
    return null;
  };

  const getAgentStateFromEvent = (event: ChimeraEvent): AgentState => {
    switch (event.type) {
      case 'agent-start':
        return 'running';
      case 'agent-end':
        return 'done';
      case 'error':
        return 'error';
      default:
        return 'idle';
    }
  };

  // Handle scroll detection
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      const scrolledUp = scrollHeight - scrollTop - clientHeight > 50;

      setUserScrolledUp(scrolledUp);
      
      if (isAtBottom && userScrolledUp) {
        setAutoScroll(true);
        setUserScrolledUp(false);
      } else if (scrolledUp) {
        setAutoScroll(false);
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [userScrolledUp]);

  // Auto-scroll to newest item
  useEffect(() => {
    if (autoScroll && !userScrolledUp) {
      timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredEvents, autoScroll, userScrolledUp]);

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Event Timeline</h2>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${
            autoScroll ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: PAUSED'}
          </span>
          <span className="text-sm text-gray-500">
            {filteredEvents.length} / {events.length} events
          </span>
        </div>
      </div>
      
      <div 
        ref={containerRef}
        className="h-96 overflow-y-auto border border-gray-200 rounded-md p-4 bg-gray-50"
      >
        {filteredEvents.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            {events.length === 0 ? (
              <>
                <p>No events in timeline yet...</p>
                <p className="text-sm mt-2">Events will appear here as they are received</p>
              </>
            ) : (
              <>
                <p>No events match the current filters</p>
                <p className="text-sm mt-2">Try adjusting your search or filter settings</p>
              </>
            )}
          </div>
        ) : (
          <div className="relative">
            {/* Vertical timeline line */}
            <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-300"></div>
            
            <div className="space-y-4">
              {filteredEvents.map((event, index) => (
                <div key={index} className="relative flex items-start">
                  {/* Timeline dot */}
                  <div className="absolute left-4 w-4 h-4 bg-white border-4 border-gray-300 rounded-full z-10"></div>
                  
                  {/* Event content */}
                  <div className="ml-12 flex-1">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          {/* Agent Avatar */}
                          {getAgentFromEvent(event) && (
                            <AgentAvatar 
                              agent={getAgentFromEvent(event)!} 
                              state={getAgentStateFromEvent(event)}
                              size="sm"
                            />
                          )}
                          <span className="font-mono text-sm text-gray-500">
                            {formatTimestamp(event.ts)}
                          </span>
                          <span className={`px-2 py-1 rounded-md text-xs font-medium ${getEventTypeColor(event.type)}`}>
                            {event.type}
                          </span>
                          {getAgentName(event) && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">
                              {getAgentName(event)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-gray-700">
                        {getEventSummary(event)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div ref={timelineEndRef} />
      </div>
    </div>
  );
};

export default EventTimeline;
