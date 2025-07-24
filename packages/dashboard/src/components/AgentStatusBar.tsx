import React, { useState, useEffect } from 'react';
import { useEvents, ChimeraEvent } from '../contexts/EventContext';

interface AgentStatus {
  state: 'idle' | 'running' | 'done' | 'error';
  timestamp?: number;
  message?: string;
}

interface AgentStatuses {
  KERNEL: AgentStatus;
  SYNTH: AgentStatus;
  DRIVE: AgentStatus;
  AUDIT: AgentStatus;
}

const AgentStatusBar: React.FC = () => {
  const { events } = useEvents();
  const [agentStatuses, setAgentStatuses] = useState<AgentStatuses>({
    KERNEL: { state: 'idle' },
    SYNTH: { state: 'idle' },
    DRIVE: { state: 'idle' },
    AUDIT: { state: 'idle' },
  });

  useEffect(() => {
    if (events.length === 0) return;

    // Process all relevant events to build current state
    const agentEvents = events.filter((event: ChimeraEvent) => 
      ['agent-start', 'agent-end', 'error'].includes(event.type) && 
      event.payload?.agent
    );

    if (agentEvents.length === 0) return;

    // Build final state from all events
    const newStatuses: AgentStatuses = {
      KERNEL: { state: 'idle' },
      SYNTH: { state: 'idle' },
      DRIVE: { state: 'idle' },
      AUDIT: { state: 'idle' },
    };

    // Process events chronologically
    agentEvents.forEach((event: ChimeraEvent) => {
      const agentName = event.payload.agent.toUpperCase() as keyof AgentStatuses;
      
      if (!(agentName in newStatuses)) return;

      if (event.type === 'agent-start') {
        newStatuses[agentName] = {
          state: 'running',
          timestamp: event.ts,
          message: 'Started'
        };
      } else if (event.type === 'agent-end') {
        // Only set to done if not already in error state
        if (newStatuses[agentName].state !== 'error') {
          newStatuses[agentName] = {
            state: 'done',
            timestamp: event.ts,
            message: 'Completed'
          };
        }
      } else if (event.type === 'error') {
        newStatuses[agentName] = {
          state: 'error',
          timestamp: event.ts,
          message: event.payload.message || 'Error occurred'
        };
      }
    });

    setAgentStatuses(newStatuses);
  }, [events]);

  const getStatusColor = (state: AgentStatus['state']): string => {
    switch (state) {
      case 'idle': return 'bg-gray-400 dark:bg-gray-600';
      case 'running': return 'bg-blue-500';
      case 'done': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-400 dark:bg-gray-600';
    }
  };

  const getStatusText = (state: AgentStatus['state']): string => {
    switch (state) {
      case 'idle': return 'Idle';
      case 'running': return 'Running';
      case 'done': return 'Done';
      case 'error': return 'Error';
      default: return 'Idle';
    }
  };

  const formatTooltip = (agentName: string, status: AgentStatus): string => {
    const agentTitle = agentName;
    const stateText = getStatusText(status.state);
    
    if (status.state === 'idle') {
      return `${agentTitle}: ${stateText}`;
    }

    const timeString = status.timestamp ? new Date(status.timestamp).toLocaleTimeString() : '';
    
    if (status.state === 'running') {
      return `${agentTitle}: ${stateText}\nStarted at ${timeString}`;
    } else if (status.state === 'error') {
      return `${agentTitle}: ${stateText}\n${status.message} at ${timeString}`;
    } else if (status.state === 'done') {
      return `${agentTitle}: ${stateText}\nCompleted at ${timeString}`;
    }

    return `${agentTitle}: ${stateText}`;
  };

  return (
    <div className="w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
      <div className="flex justify-center space-x-6">
        {Object.entries(agentStatuses).map(([agentName, status]) => (
          <div
            key={agentName}
            className="flex items-center space-x-2"
            title={formatTooltip(agentName, status)}
          >
            <div
              className={`w-3 h-3 rounded-full ${getStatusColor(status.state)} transition-colors duration-200`}
              data-testid={`agent-badge-${agentName.toLowerCase()}`}
            />
            <span className="text-sm font-medium text-gray-700">
              {agentName}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {getStatusText(status.state)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AgentStatusBar;
