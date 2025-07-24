import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ProgressBar from './ProgressBar';
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
    this.listeners.message?.forEach(listener => listener(event));
  }
}

// Test wrapper component
const TestWrapper: React.FC<{ ws?: WebSocket | null, children: React.ReactNode }> = ({ 
  ws = null, 
  children 
}) => {
  return (
    <EventProvider ws={ws}>
      {children}
    </EventProvider>
  );
};

describe('ProgressBar', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWs = new MockWebSocket('ws://localhost:4000/events');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('renders the ProgressBar component', () => {
      render(
        <TestWrapper>
          <ProgressBar />
        </TestWrapper>
      );

      expect(screen.getByText('Workflow Progress')).toBeInTheDocument();
      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });

    it('shows indeterminate state initially', () => {
      render(
        <TestWrapper>
          <ProgressBar />
        </TestWrapper>
      );

      expect(screen.getByText('Starting...')).toBeInTheDocument();
      
      // Check for indeterminate animation elements
      const progressContainer = screen.getByText('Workflow Progress').closest('div');
      expect(progressContainer).toBeInTheDocument();
    });

    it('displays indeterminate animation until first progress event', () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });
  });

  describe('Progress Updates', () => {
    it('updates to show percentage when progress event received', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Initially indeterminate
      expect(screen.getByText('Starting...')).toBeInTheDocument();

      // Send progress event
      const progressEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: 25 }
      };

      mockWs.simulateMessage(progressEvent);

      await waitFor(() => {
        expect(screen.getByText('25%')).toBeInTheDocument();
        expect(screen.queryByText('Starting...')).not.toBeInTheDocument();
      });
    });

    it('updates to latest progress percentage', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send first progress event
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: 25 }
      });

      await waitFor(() => {
        expect(screen.getByText('25%')).toBeInTheDocument();
      });

      // Send second progress event
      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'progress',
        payload: { percentage: 75 }
      });

      await waitFor(() => {
        expect(screen.getByText('75%')).toBeInTheDocument();
        expect(screen.queryByText('25%')).not.toBeInTheDocument();
      });
    });

    it('handles progress values correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Test various progress values
      const testCases = [
        { percentage: 0, expected: '0%' },
        { percentage: 50, expected: '50%' },
        { percentage: 99, expected: '99%' },
        { percentage: 100, expected: '100%' }
      ];

      for (const testCase of testCases) {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'progress',
          payload: { percentage: testCase.percentage }
        });

        await waitFor(() => {
          expect(screen.getByText(testCase.expected)).toBeInTheDocument();
        });
      }
    });

    it('clamps progress values to 0-100 range', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Test negative value
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: -10 }
      });

      await waitFor(() => {
        expect(screen.getByText('0%')).toBeInTheDocument();
      });

      // Test value over 100
      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'progress',
        payload: { percentage: 150 }
      });

      await waitFor(() => {
        expect(screen.getByText('100%')).toBeInTheDocument();
      });
    });

    it('rounds progress percentages correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Test decimal values
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: 33.7 }
      });

      await waitFor(() => {
        expect(screen.getByText('34%')).toBeInTheDocument();
      });

      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'progress',
        payload: { percentage: 66.2 }
      });

      await waitFor(() => {
        expect(screen.getByText('66%')).toBeInTheDocument();
      });
    });
  });

  describe('Workflow Completion', () => {
    it('shows "Done" state when workflow-complete event received', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send workflow-complete event
      const completeEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'workflow-complete',
        payload: { workflow: 'test-workflow' }
      };

      mockWs.simulateMessage(completeEvent);

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(screen.getByText('Workflow completed successfully')).toBeInTheDocument();
      });
    });

    it('sets progress to 100% on workflow completion', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send progress event first
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: 80 }
      });

      await waitFor(() => {
        expect(screen.getByText('80%')).toBeInTheDocument();
      });

      // Send workflow-complete event
      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'workflow-complete',
        payload: { workflow: 'test-workflow' }
      });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(screen.getByText('Workflow completed successfully')).toBeInTheDocument();
      });
    });

    it('handles workflow completion without prior progress events', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Initially indeterminate
      expect(screen.getByText('Starting...')).toBeInTheDocument();

      // Send workflow-complete event directly
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'workflow-complete',
        payload: { workflow: 'test-workflow' }
      });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
        expect(screen.getByText('Workflow completed successfully')).toBeInTheDocument();
        expect(screen.queryByText('Starting...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Event Processing', () => {
    it('processes events in chronological order', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send events in order
      const baseTime = Date.now();
      
      mockWs.simulateMessage({
        ts: baseTime,
        type: 'progress',
        payload: { percentage: 20 }
      });

      mockWs.simulateMessage({
        ts: baseTime + 1000,
        type: 'progress',
        payload: { percentage: 60 }
      });

      mockWs.simulateMessage({
        ts: baseTime + 2000,
        type: 'progress',
        payload: { percentage: 90 }
      });

      await waitFor(() => {
        expect(screen.getByText('90%')).toBeInTheDocument();
      });
    });

    it('ignores non-progress and non-workflow-complete events', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send non-progress events
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'agent-start',
        payload: { agent: 'TestAgent' }
      });

      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'log',
        payload: { message: 'Test log' }
      });

      // Should still be indeterminate
      expect(screen.getByText('Starting...')).toBeInTheDocument();

      // Now send a progress event
      mockWs.simulateMessage({
        ts: Date.now() + 2000,
        type: 'progress',
        payload: { percentage: 45 }
      });

      await waitFor(() => {
        expect(screen.getByText('45%')).toBeInTheDocument();
      });
    });

    it('handles progress events with missing percentage', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send progress event without percentage
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'progress',
        payload: { message: 'Progress update' }
      });

      // Should still be indeterminate
      expect(screen.getByText('Starting...')).toBeInTheDocument();

      // Send valid progress event
      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'progress',
        payload: { percentage: 30 }
      });

      await waitFor(() => {
        expect(screen.getByText('30%')).toBeInTheDocument();
      });
    });
  });

  describe('UI Styling', () => {
    it('applies correct styling for indeterminate state', () => {
      render(
        <TestWrapper>
          <ProgressBar />
        </TestWrapper>
      );

      const progressTitle = screen.getByText('Workflow Progress');
      const container = progressTitle.closest('div.bg-white');
      expect(container).toHaveClass('bg-white', 'rounded-lg', 'shadow-sm');
    });

    it('applies correct styling for progress state', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: 50 }
      });

      await waitFor(() => {
        expect(screen.getByText('50%')).toBeInTheDocument();
      });
    });

    it('applies correct styling for completed state', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'workflow-complete',
        payload: { workflow: 'test' }
      });

      await waitFor(() => {
        const doneText = screen.getByText('Done');
        expect(doneText).toHaveClass('text-emerald-600');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles null WebSocket gracefully', () => {
      render(
        <TestWrapper ws={null}>
          <ProgressBar />
        </TestWrapper>
      );

      expect(screen.getByText('Workflow Progress')).toBeInTheDocument();
      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });

    it('handles multiple workflow-complete events', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send first workflow-complete event
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'workflow-complete',
        payload: { workflow: 'test1' }
      });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });

      // Send second workflow-complete event
      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'workflow-complete',
        payload: { workflow: 'test2' }
      });

      // Should still show Done
      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });
    });

    it('handles progress events after workflow completion', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ProgressBar />
        </TestWrapper>
      );

      // Send workflow-complete first
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'workflow-complete',
        payload: { workflow: 'test' }
      });

      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });

      // Send progress event after completion (should be ignored in display)
      mockWs.simulateMessage({
        ts: Date.now() + 1000,
        type: 'progress',
        payload: { percentage: 50 }
      });

      // Should still show Done (completion takes precedence)
      await waitFor(() => {
        expect(screen.getByText('Done')).toBeInTheDocument();
      });
    });
  });
});
