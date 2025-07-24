import React, { useState, useEffect } from 'react';
import { useEvents, FilterState } from '../contexts/EventContext';

const TimelineFilterBar: React.FC = () => {
  const { filters, setFilters } = useEvents();
  const [localQuery, setLocalQuery] = useState(filters.query);

  // Debounce query updates
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQuery !== filters.query) {
        setFilters({
          ...filters,
          query: localQuery,
        });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [localQuery, filters, setFilters]);

  const handleAgentToggle = (agent: keyof FilterState['agents']) => {
    setFilters({
      ...filters,
      agents: {
        ...filters.agents,
        [agent]: !filters.agents[agent],
      },
    });
  };

  const handleEventTypeToggle = (eventType: keyof FilterState['eventTypes']) => {
    setFilters({
      ...filters,
      eventTypes: {
        ...filters.eventTypes,
        [eventType]: !filters.eventTypes[eventType],
      },
    });
  };

  const getAgentColor = (agent: string, isActive: boolean): string => {
    const colors = {
      KERNEL: isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500',
      SYNTH: isActive ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500',
      DRIVE: isActive ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-500',
      AUDIT: isActive ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-500',
    };
    return colors[agent as keyof typeof colors] || 'bg-gray-200 text-gray-500';
  };

  const getEventTypeColor = (eventType: string, isActive: boolean): string => {
    const baseColors = {
      log: 'gray',
      progress: 'green',
      'agent-start': 'blue',
      'agent-end': 'blue',
      error: 'red',
    };
    
    const color = baseColors[eventType as keyof typeof baseColors] || 'gray';
    return isActive 
      ? `bg-${color}-500 text-white` 
      : 'bg-gray-200 text-gray-500';
  };

  const clearAllFilters = () => {
    setLocalQuery('');
    setFilters({
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
  };

  const hasActiveFilters = () => {
    return filters.query !== '' ||
           !Object.values(filters.agents).every(v => v) ||
           !Object.values(filters.eventTypes).every(v => v);
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Timeline Filters</h3>
        {hasActiveFilters() && (
          <button
            onClick={clearAllFilters}
            className="px-3 py-1 text-sm bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      {/* Search Query */}
      <div className="mb-4">
        <label htmlFor="filter-query" className="block text-sm font-medium text-gray-700 mb-2">
          Search Events
        </label>
        <input
          id="filter-query"
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Type to search event payload or type..."
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Agent Toggles */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Agent Filters
        </label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters.agents).map(([agent, isActive]) => (
            <button
              key={agent}
              onClick={() => handleAgentToggle(agent as keyof FilterState['agents'])}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${getAgentColor(agent, isActive)}`}
            >
              {agent}
            </button>
          ))}
        </div>
      </div>

      {/* Event Type Toggles */}
      <div className="mb-2">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Event Type Filters
        </label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(filters.eventTypes).map(([eventType, isActive]) => (
            <button
              key={eventType}
              onClick={() => handleEventTypeToggle(eventType as keyof FilterState['eventTypes'])}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${getEventTypeColor(eventType, isActive)}`}
            >
              {eventType}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TimelineFilterBar;
