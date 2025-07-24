import React from 'react';

export type AgentType = 'KERNEL' | 'SYNTH' | 'DRIVE' | 'AUDIT';
export type AgentState = 'idle' | 'running' | 'done' | 'error';

interface AgentAvatarProps {
  agent: AgentType;
  state: AgentState;
  size?: 'sm' | 'md' | 'lg';
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ 
  agent, 
  state, 
  size = 'md' 
}) => {
  const getSizeClasses = (size: string) => {
    switch (size) {
      case 'sm': return 'w-6 h-6';
      case 'lg': return 'w-12 h-12';
      default: return 'w-8 h-8';
    }
  };

  const getAgentColors = (agent: AgentType, state: AgentState) => {
    const baseColors = {
      KERNEL: { primary: '#3B82F6', secondary: '#1E40AF' }, // Blue
      SYNTH: { primary: '#10B981', secondary: '#047857' },   // Green
      DRIVE: { primary: '#F59E0B', secondary: '#D97706' },   // Amber
      AUDIT: { primary: '#8B5CF6', secondary: '#7C3AED' },   // Purple
    };

    const agentColor = baseColors[agent];
    
    switch (state) {
      case 'running':
        return { primary: agentColor.primary, secondary: agentColor.secondary };
      case 'done':
        return { primary: '#10B981', secondary: '#047857' }; // Green for done
      case 'error':
        return { primary: '#EF4444', secondary: '#DC2626' }; // Red for error
      default:
        return { primary: '#9CA3AF', secondary: '#6B7280' }; // Gray for idle
    }
  };

  const getAnimationClasses = (state: AgentState) => {
    switch (state) {
      case 'running':
        return 'animate-pulse';
      case 'error':
        return 'animate-bounce';
      case 'done':
        return '';
      default:
        return '';
    }
  };

  const colors = getAgentColors(agent, state);
  const animationClass = getAnimationClasses(state);
  const sizeClass = getSizeClasses(size);

  const getAgentIcon = (agent: AgentType) => {
    switch (agent) {
      case 'KERNEL':
        return (
          <g>
            {/* Core circle */}
            <circle cx="12" cy="12" r="6" fill={colors.primary} />
            <circle cx="12" cy="12" r="3" fill={colors.secondary} />
            {/* Radiating lines */}
            <line x1="12" y1="3" x2="12" y2="6" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="21" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" />
            <line x1="3" y1="12" x2="6" y2="12" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" />
            <line x1="18" y1="12" x2="21" y2="12" stroke={colors.primary} strokeWidth="2" strokeLinecap="round" />
          </g>
        );
      
      case 'SYNTH':
        return (
          <g>
            {/* Hexagon shape */}
            <polygon 
              points="12,2 20.5,7 20.5,17 12,22 3.5,17 3.5,7" 
              fill={colors.primary} 
              stroke={colors.secondary} 
              strokeWidth="2"
            />
            {/* Inner triangle */}
            <polygon points="12,8 16,14 8,14" fill={colors.secondary} />
          </g>
        );
      
      case 'DRIVE':
        return (
          <g>
            {/* Gear shape */}
            <path 
              d="M12 2l2.09 6.26L20 6.16l-1.91 6.26L24 12l-5.91 1.74L20 19.84l-5.91-2.1L12 22l-2.09-4.16L4 19.84l1.91-6.26L0 12l5.91-1.74L4 6.16l5.91 2.1L12 2z" 
              fill={colors.primary}
              transform="scale(0.5) translate(12, 12)"
            />
            <circle cx="12" cy="12" r="4" fill={colors.secondary} />
          </g>
        );
      
      case 'AUDIT':
        return (
          <g>
            {/* Shield shape */}
            <path 
              d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6l-8-4z" 
              fill={colors.primary} 
              stroke={colors.secondary} 
              strokeWidth="2"
            />
            {/* Checkmark */}
            <path 
              d="M9 12l2 2 4-4" 
              stroke={colors.secondary} 
              strokeWidth="2" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </g>
        );
      
      default:
        return (
          <circle cx="12" cy="12" r="8" fill={colors.primary} />
        );
    }
  };

  return (
    <div 
      className={`${sizeClass} ${animationClass} flex-shrink-0`}
      role="img"
      aria-label={`${agent} agent avatar - ${state} state`}
      data-testid={`agent-avatar-${agent.toLowerCase()}`}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 24 24"
        className="drop-shadow-sm"
      >
        {state === 'error' && (
          <defs>
            <filter id="error-glow">
              <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
              <feMerge> 
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
        )}
        <g filter={state === 'error' ? 'url(#error-glow)' : undefined}>
          {getAgentIcon(agent)}
        </g>
      </svg>
    </div>
  );
};

export default AgentAvatar;
