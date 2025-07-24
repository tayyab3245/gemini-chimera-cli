import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import AgentAvatar, { AgentType, AgentState } from './AgentAvatar';

describe('AgentAvatar', () => {
  describe('Rendering', () => {
    it('renders the AgentAvatar component', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toBeInTheDocument();
    });

    it('applies correct accessibility attributes', () => {
      render(<AgentAvatar agent="SYNTH" state="running" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toHaveAttribute('aria-label', 'SYNTH agent avatar - running state');
    });

    it('renders SVG element correctly', () => {
      render(<AgentAvatar agent="DRIVE" state="done" />);
      const svg = screen.getByTestId('agent-avatar-drive').querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });
  });

  describe('Agent Types', () => {
    const agentTypes: AgentType[] = ['KERNEL', 'SYNTH', 'DRIVE', 'AUDIT'];

    agentTypes.forEach(agent => {
      it(`renders ${agent} agent correctly`, () => {
        render(<AgentAvatar agent={agent} state="idle" />);
        const avatar = screen.getByTestId(`agent-avatar-${agent.toLowerCase()}`);
        expect(avatar).toBeInTheDocument();
        expect(avatar).toHaveAttribute('aria-label', `${agent} agent avatar - idle state`);
      });
    });

    it('renders KERNEL with core and radiating lines', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const svg = screen.getByTestId('agent-avatar-kernel').querySelector('svg');
      const circles = svg?.querySelectorAll('circle');
      const lines = svg?.querySelectorAll('line');
      expect(circles).toHaveLength(2); // Core circles
      expect(lines).toHaveLength(4); // Radiating lines
    });

    it('renders SYNTH with hexagon shape', () => {
      render(<AgentAvatar agent="SYNTH" state="idle" />);
      const svg = screen.getByTestId('agent-avatar-synth').querySelector('svg');
      const polygons = svg?.querySelectorAll('polygon');
      expect(polygons).toHaveLength(2); // Hexagon + inner triangle
    });

    it('renders DRIVE with gear shape', () => {
      render(<AgentAvatar agent="DRIVE" state="idle" />);
      const svg = screen.getByTestId('agent-avatar-drive').querySelector('svg');
      const paths = svg?.querySelectorAll('path');
      const circles = svg?.querySelectorAll('circle');
      expect(paths).toHaveLength(1); // Gear path
      expect(circles).toHaveLength(1); // Center circle
    });

    it('renders AUDIT with shield shape', () => {
      render(<AgentAvatar agent="AUDIT" state="idle" />);
      const svg = screen.getByTestId('agent-avatar-audit').querySelector('svg');
      const paths = svg?.querySelectorAll('path');
      expect(paths).toHaveLength(2); // Shield + checkmark
    });
  });

  describe('State Animations', () => {
    const states: AgentState[] = ['idle', 'running', 'done', 'error'];

    states.forEach(state => {
      it(`renders ${state} state correctly`, () => {
        render(<AgentAvatar agent="KERNEL" state={state} />);
        const avatar = screen.getByTestId('agent-avatar-kernel');
        expect(avatar).toHaveAttribute('aria-label', `KERNEL agent avatar - ${state} state`);
      });
    });

    it('applies pulse animation for running state', () => {
      render(<AgentAvatar agent="KERNEL" state="running" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('animate-pulse');
    });

    it('applies bounce animation for error state', () => {
      render(<AgentAvatar agent="KERNEL" state="error" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('animate-bounce');
    });

    it('applies no animation for idle state', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).not.toHaveClass('animate-pulse');
      expect(avatar).not.toHaveClass('animate-bounce');
    });

    it('applies no animation for done state', () => {
      render(<AgentAvatar agent="KERNEL" state="done" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).not.toHaveClass('animate-pulse');
      expect(avatar).not.toHaveClass('animate-bounce');
    });

    it('applies error glow filter for error state', () => {
      render(<AgentAvatar agent="KERNEL" state="error" />);
      const svg = screen.getByTestId('agent-avatar-kernel').querySelector('svg');
      const defs = svg?.querySelector('defs');
      const filter = defs?.querySelector('filter[id="error-glow"]');
      expect(filter).toBeInTheDocument();
    });

    it('does not apply error glow filter for non-error states', () => {
      render(<AgentAvatar agent="KERNEL" state="running" />);
      const svg = screen.getByTestId('agent-avatar-kernel').querySelector('svg');
      const defs = svg?.querySelector('defs');
      expect(defs).not.toBeInTheDocument();
    });
  });

  describe('Size Variants', () => {
    it('renders small size correctly', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" size="sm" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('w-6', 'h-6');
    });

    it('renders medium size correctly (default)', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" size="md" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('w-8', 'h-8');
    });

    it('renders medium size when no size specified', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('w-8', 'h-8');
    });

    it('renders large size correctly', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" size="lg" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('w-12', 'h-12');
    });
  });

  describe('State Color Changes', () => {
    it('uses agent-specific colors for idle state', () => {
      const { rerender } = render(<AgentAvatar agent="KERNEL" state="idle" />);
      expect(screen.getByTestId('agent-avatar-kernel')).toBeInTheDocument();

      rerender(<AgentAvatar agent="SYNTH" state="idle" />);
      expect(screen.getByTestId('agent-avatar-synth')).toBeInTheDocument();

      rerender(<AgentAvatar agent="DRIVE" state="idle" />);
      expect(screen.getByTestId('agent-avatar-drive')).toBeInTheDocument();

      rerender(<AgentAvatar agent="AUDIT" state="idle" />);
      expect(screen.getByTestId('agent-avatar-audit')).toBeInTheDocument();
    });

    it('uses green colors for done state regardless of agent', () => {
      const agents: AgentType[] = ['KERNEL', 'SYNTH', 'DRIVE', 'AUDIT'];
      
      agents.forEach(agent => {
        const { unmount } = render(<AgentAvatar agent={agent} state="done" />);
        const avatar = screen.getByTestId(`agent-avatar-${agent.toLowerCase()}`);
        expect(avatar).toBeInTheDocument();
        unmount();
      });
    });

    it('uses red colors for error state regardless of agent', () => {
      const agents: AgentType[] = ['KERNEL', 'SYNTH', 'DRIVE', 'AUDIT'];
      
      agents.forEach(agent => {
        const { unmount } = render(<AgentAvatar agent={agent} state="error" />);
        const avatar = screen.getByTestId(`agent-avatar-${agent.toLowerCase()}`);
        expect(avatar).toBeInTheDocument();
        expect(avatar).toHaveClass('animate-bounce');
        unmount();
      });
    });
  });

  describe('Animation State Transitions', () => {
    it('transitions from idle to running correctly', () => {
      const { rerender } = render(<AgentAvatar agent="KERNEL" state="idle" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      
      expect(avatar).not.toHaveClass('animate-pulse');
      expect(avatar).toHaveAttribute('aria-label', 'KERNEL agent avatar - idle state');

      rerender(<AgentAvatar agent="KERNEL" state="running" />);
      
      expect(avatar).toHaveClass('animate-pulse');
      expect(avatar).toHaveAttribute('aria-label', 'KERNEL agent avatar - running state');
    });

    it('transitions from running to done correctly', () => {
      const { rerender } = render(<AgentAvatar agent="KERNEL" state="running" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      
      expect(avatar).toHaveClass('animate-pulse');
      expect(avatar).toHaveAttribute('aria-label', 'KERNEL agent avatar - running state');

      rerender(<AgentAvatar agent="KERNEL" state="done" />);
      
      expect(avatar).not.toHaveClass('animate-pulse');
      expect(avatar).toHaveAttribute('aria-label', 'KERNEL agent avatar - done state');
    });

    it('transitions from running to error correctly', () => {
      const { rerender } = render(<AgentAvatar agent="KERNEL" state="running" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      
      expect(avatar).toHaveClass('animate-pulse');
      expect(avatar).not.toHaveClass('animate-bounce');

      rerender(<AgentAvatar agent="KERNEL" state="error" />);
      
      expect(avatar).not.toHaveClass('animate-pulse');
      expect(avatar).toHaveClass('animate-bounce');
      expect(avatar).toHaveAttribute('aria-label', 'KERNEL agent avatar - error state');
    });
  });

  describe('Accessibility', () => {
    it('has proper role attribute', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const avatar = screen.getByRole('img');
      expect(avatar).toBeInTheDocument();
    });

    it('provides descriptive aria-label for all combinations', () => {
      const agents: AgentType[] = ['KERNEL', 'SYNTH', 'DRIVE', 'AUDIT'];
      const states: AgentState[] = ['idle', 'running', 'done', 'error'];

      agents.forEach(agent => {
        states.forEach(state => {
          const { unmount } = render(<AgentAvatar agent={agent} state={state} />);
          const avatar = screen.getByRole('img');
          expect(avatar).toHaveAttribute('aria-label', `${agent} agent avatar - ${state} state`);
          unmount();
        });
      });
    });

    it('includes flex-shrink-0 for layout stability', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const avatar = screen.getByTestId('agent-avatar-kernel');
      expect(avatar).toHaveClass('flex-shrink-0');
    });
  });

  describe('Visual Consistency', () => {
    it('maintains consistent SVG structure across agents', () => {
      const agents: AgentType[] = ['KERNEL', 'SYNTH', 'DRIVE', 'AUDIT'];
      
      agents.forEach(agent => {
        const { unmount } = render(<AgentAvatar agent={agent} state="idle" />);
        const svg = screen.getByTestId(`agent-avatar-${agent.toLowerCase()}`).querySelector('svg');
        
        expect(svg).toHaveAttribute('width', '100%');
        expect(svg).toHaveAttribute('height', '100%');
        expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
        expect(svg).toHaveClass('drop-shadow-sm');
        
        unmount();
      });
    });

    it('applies drop-shadow consistently', () => {
      render(<AgentAvatar agent="KERNEL" state="idle" />);
      const svg = screen.getByTestId('agent-avatar-kernel').querySelector('svg');
      expect(svg).toHaveClass('drop-shadow-sm');
    });
  });
});
