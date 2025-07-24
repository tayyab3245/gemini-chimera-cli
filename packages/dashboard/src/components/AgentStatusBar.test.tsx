import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AgentStatusBar from './AgentStatusBar';
import { EventProvider, ChimeraEvent } from '../contexts/EventContext';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.OPEN;
  url = '';
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  
  private listeners: { [key: string]: ((event: any) => void)[] } = {};

  constructor(url: string) {
    this.url = url;
  }

  send(_data: string) {
    // Mock implementation
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: (event: any) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }
  }

  // Helper method to simulate receiving a message
  simulateMessage(data: any) {
    const event = new MessageEvent('message', { data: JSON.stringify(data) });
    this.listeners['message']?.forEach(listener => listener(event));
  }
}

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode; ws?: WebSocket | null }> = ({ 
  children, 
  ws = null 
}) => (
  <EventProvider ws={ws}>
    {children}
  </EventProvider>
);

describe('AgentStatusBar', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    mockWs = new MockWebSocket('ws://localhost:8080');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('renders all four agent badges', () => {
      render(
        <TestWrapper>
          <AgentStatusBar />
        </TestWrapper>
      );

      expect(screen.getByTestId('agent-badge-kernel')).toBeInTheDocument();
      expect(screen.getByTestId('agent-badge-synth')).toBeInTheDocument();
      expect(screen.getByTestId('agent-badge-drive')).toBeInTheDocument();
      expect(screen.getByTestId('agent-badge-audit')).toBeInTheDocument();
    });

    it('shows all agents in idle state initially', () => {
      render(
        <TestWrapper>
          <AgentStatusBar />
        </TestWrapper>
      );

      expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-synth')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-drive')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-audit')).toHaveClass('bg-gray-400');
    });

    it('displays agent names and idle status text', () => {
      render(
        <TestWrapper>
          <AgentStatusBar />
        </TestWrapper>
      );

      expect(screen.getByText('KERNEL')).toBeInTheDocument();
      expect(screen.getByText('SYNTH')).toBeInTheDocument();
      expect(screen.getByText('DRIVE')).toBeInTheDocument();
      expect(screen.getByText('AUDIT')).toBeInTheDocument();
      
      // Should show 4 instances of "Idle" text
      const idleTexts = screen.getAllByText('Idle');
      expect(idleTexts).toHaveLength(4);
    });
  });

  describe('Agent Start Events', () => {
    it('sets agent to running state when agent-start event received', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-blue-500');
      });

      expect(screen.getByText('Running')).toBeInTheDocument();
    });

    it('handles multiple agent-start events for different agents', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 1,
          type: 'agent-start',
          payload: { agent: 'synth' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-blue-500');
        expect(screen.getByTestId('agent-badge-synth')).toHaveClass('bg-blue-500');
      });
    });

    it('handles case-insensitive agent names', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'KERNEL' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-blue-500');
      });
    });
  });

  describe('Agent End Events', () => {
    it('sets agent to done state when agent-end event received after start', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 1000,
          type: 'agent-end',
          payload: { agent: 'kernel' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-green-500');
      });

      expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('handles agent-end without prior agent-start', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-end',
          payload: { agent: 'kernel' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-green-500');
      });
    });
  });

  describe('Error Events', () => {
    it('sets agent to error state when error event received', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: { 
            agent: 'kernel',
            message: 'Connection timeout'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-red-500');
      });

      expect(screen.getByText('Error')).toBeInTheDocument();
    });

    it('error state overrides running state', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 1,
          type: 'error',
          payload: { 
            agent: 'kernel',
            message: 'Unexpected error'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-red-500');
      });
    });

    it('error state persists through agent-end events', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 1,
          type: 'error',
          payload: { 
            agent: 'kernel',
            message: 'Critical error'
          }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 2,
          type: 'agent-end',
          payload: { agent: 'kernel' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-red-500');
      });
    });
  });

  describe('Tooltips', () => {
    it('shows basic tooltip for idle agent', () => {
      render(
        <TestWrapper>
          <AgentStatusBar />
        </TestWrapper>
      );

      const kernelBadge = screen.getByTestId('agent-badge-kernel').parentElement;
      expect(kernelBadge).toHaveAttribute('title', 'KERNEL: Idle');
    });

    it('shows detailed tooltip with timestamp for running agent', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
      });

      await waitFor(() => {
        const kernelBadge = screen.getByTestId('agent-badge-kernel').parentElement;
        const title = kernelBadge?.getAttribute('title') || '';
        expect(title).toMatch(/KERNEL: Running\nStarted at \d{1,2}:\d{2}:\d{2}/);
      });
    });

    it('shows error message in tooltip for error state', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: { 
            agent: 'kernel',
            message: 'Connection timeout'
          }
        });
      });

      await waitFor(() => {
        const kernelBadge = screen.getByTestId('agent-badge-kernel').parentElement;
        const title = kernelBadge?.getAttribute('title') || '';
        expect(title).toMatch(/KERNEL: Error\nConnection timeout at \d{1,2}:\d{2}:\d{2}/);
      });
    });
  });

  describe('State Transitions', () => {
    it('handles complex workflow with multiple state changes', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        // Start kernel
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'kernel' }
        });
        // Complete kernel
        mockWs.simulateMessage({
          ts: Date.now() + 1000,
          type: 'agent-end',
          payload: { agent: 'kernel' }
        });
        // Start synth
        mockWs.simulateMessage({
          ts: Date.now() + 2000,
          type: 'agent-start',
          payload: { agent: 'synth' }
        });
        // Error in synth
        mockWs.simulateMessage({
          ts: Date.now() + 3000,
          type: 'error',
          payload: { 
            agent: 'synth',
            message: 'Processing failed'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-green-500');
        expect(screen.getByTestId('agent-badge-synth')).toHaveClass('bg-red-500');
        expect(screen.getByTestId('agent-badge-drive')).toHaveClass('bg-gray-400');
        expect(screen.getByTestId('agent-badge-audit')).toHaveClass('bg-gray-400');
      });
    });

    it('handles rapid state changes correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'drive' }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 1,
          type: 'agent-start',
          payload: { agent: 'drive' }
        });
        mockWs.simulateMessage({
          ts: Date.now() + 2,
          type: 'agent-start',
          payload: { agent: 'drive' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-drive')).toHaveClass('bg-blue-500');
      });
    });
  });

  describe('Edge Cases', () => {
    it('ignores events without agent field', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { message: 'No agent field' }
        });
      });

      // All agents should remain idle
      expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-synth')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-drive')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-audit')).toHaveClass('bg-gray-400');
    });

    it('ignores events for unknown agents', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'agent-start',
          payload: { agent: 'unknown-agent' }
        });
      });

      // All agents should remain idle
      expect(screen.getByTestId('agent-badge-kernel')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-synth')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-drive')).toHaveClass('bg-gray-400');
      expect(screen.getByTestId('agent-badge-audit')).toHaveClass('bg-gray-400');
    });

    it('handles error events without message', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <AgentStatusBar />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: { agent: 'audit' }
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('agent-badge-audit')).toHaveClass('bg-red-500');
        const auditBadge = screen.getByTestId('agent-badge-audit').parentElement;
        const title = auditBadge?.getAttribute('title') || '';
        expect(title).toMatch(/AUDIT: Error\nError occurred at \d{1,2}:\d{2}:\d{2}/);
      });
    });
  });
});
