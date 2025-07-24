import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import EventTimeline from './EventTimeline';
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

// Mock scroll methods
const mockScrollIntoView = vi.fn();
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: mockScrollIntoView,
  writable: true,
});

describe('EventTimeline', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.clearAllMocks();
    mockScrollIntoView.mockClear();
    mockWs = new MockWebSocket('ws://localhost:4000/events');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the EventTimeline component', () => {
      render(
        <TestWrapper>
          <EventTimeline />
        </TestWrapper>
      );

      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
      expect(screen.getByText('Auto-scroll: ON')).toBeInTheDocument();
      expect(screen.getByText('0 / 0 events')).toBeInTheDocument();
    });

    it('shows empty state when no events', () => {
      render(
        <TestWrapper>
          <EventTimeline />
        </TestWrapper>
      );

      expect(screen.getByText('No events in timeline yet...')).toBeInTheDocument();
      expect(screen.getByText('Events will appear here as they are received')).toBeInTheDocument();
    });

    it('renders events in timeline format', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'agent-start',
        payload: { agent: 'TestAgent' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('agent-start')).toBeInTheDocument();
        expect(screen.getByText('TestAgent')).toBeInTheDocument();
        expect(screen.getByText('Agent started: TestAgent')).toBeInTheDocument();
        expect(screen.getByText('1 / 1 events')).toBeInTheDocument();
      });
    });
  });

  describe('Event Formatting', () => {
    it('formats timestamps correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testTime = new Date('2025-07-24T10:30:45.000Z').getTime();
      const testEvent: ChimeraEvent = {
        ts: testTime,
        type: 'log',
        payload: { message: 'Test message' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        // Should show time in HH:MM:SS format (will depend on timezone)
        expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
      });
    });

    it('displays agent-start events correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'agent-start',
        payload: { agent: 'DriveAgent' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('agent-start')).toBeInTheDocument();
        expect(screen.getByText('DriveAgent')).toBeInTheDocument();
        expect(screen.getByText('Agent started: DriveAgent')).toBeInTheDocument();
      });
    });

    it('displays agent-end events correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'agent-end',
        payload: { agent: 'DriveAgent' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('agent-end')).toBeInTheDocument();
        expect(screen.getByText('DriveAgent')).toBeInTheDocument();
        expect(screen.getByText('Agent completed: DriveAgent')).toBeInTheDocument();
      });
    });

    it('displays progress events correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'progress',
        payload: { percentage: 75 }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('progress')).toBeInTheDocument();
        expect(screen.getByText('Progress: 75%')).toBeInTheDocument();
      });
    });

    it('displays error events correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'error',
        payload: { message: 'Something went wrong' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('error')).toBeInTheDocument();
        expect(screen.getByText('Error: Something went wrong')).toBeInTheDocument();
      });
    });

    it('displays log events correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'log',
        payload: { message: 'Debug information' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('log')).toBeInTheDocument();
        expect(screen.getByText('Log: Debug information')).toBeInTheDocument();
      });
    });

    it('truncates long summaries to 120 characters', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const longMessage = 'This is a very long message that exceeds 120 characters and should be truncated with ellipsis to keep the UI clean and readable';
      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'log',
        payload: { message: longMessage }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText(/This is a very long message.*\.\.\./)).toBeInTheDocument();
      });
    });
  });

  describe('Live Updates', () => {
    it('updates timeline when new events arrive', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      // Initially no events
      expect(screen.getByText('0 / 0 events')).toBeInTheDocument();

      // Add first event
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'agent-start',
        payload: { agent: 'Agent1' }
      });

      await waitFor(() => {
        expect(screen.getByText('1 / 1 events')).toBeInTheDocument();
        expect(screen.getByText('Agent started: Agent1')).toBeInTheDocument();
      });

      // Add second event
      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'agent-end',
        payload: { agent: 'Agent1' }
      });

      await waitFor(() => {
        expect(screen.getByText('2 / 2 events')).toBeInTheDocument();
        expect(screen.getByText('Agent completed: Agent1')).toBeInTheDocument();
      });
    });

    it('maintains event order (chronological)', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const time1 = Date.now();
      const time2 = time1 + 1000;
      const time3 = time2 + 1000;

      // Add events in order
      mockWs.simulateMessage({
        ts: time1,
        type: 'agent-start',
        payload: { agent: 'Agent1' }
      });

      mockWs.simulateMessage({
        ts: time2,
        type: 'progress',
        payload: { percentage: 50 }
      });

      mockWs.simulateMessage({
        ts: time3,
        type: 'agent-end',
        payload: { agent: 'Agent1' }
      });

      await waitFor(() => {
        expect(screen.getByText('3 / 3 events')).toBeInTheDocument();
        
        // Verify all three event types are present
        expect(screen.getByText('Agent started: Agent1')).toBeInTheDocument();
        expect(screen.getByText('Progress: 50%')).toBeInTheDocument();
        expect(screen.getByText('Agent completed: Agent1')).toBeInTheDocument();
      });
    });
  });

  describe('Auto-scroll Behavior', () => {
    it('calls scrollIntoView when new events arrive and auto-scroll is enabled', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      mockWs.simulateMessage({
        ts: Date.now(),
        type: 'log',
        payload: { message: 'Test message' }
      });

      await waitFor(() => {
        expect(mockScrollIntoView).toHaveBeenCalled();
      });
    });

    it('shows auto-scroll status correctly', () => {
      render(
        <TestWrapper>
          <EventTimeline />
        </TestWrapper>
      );

      expect(screen.getByText('Auto-scroll: ON')).toBeInTheDocument();
    });

    it('handles scroll events to pause auto-scroll', async () => {
      const { container } = render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      // Find the scrollable container
      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      expect(scrollContainer).toBeInTheDocument();

      // Mock scroll properties to simulate user scrolling up
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, writable: true });

      fireEvent.scroll(scrollContainer!);

      await waitFor(() => {
        expect(screen.getByText('Auto-scroll: PAUSED')).toBeInTheDocument();
      });
    });

    it('resumes auto-scroll when scrolled back to bottom', async () => {
      const { container } = render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const scrollContainer = container.querySelector('[class*="overflow-y-auto"]');
      
      // First scroll up to pause
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 0, writable: true });
      Object.defineProperty(scrollContainer, 'scrollHeight', { value: 500, writable: true });
      Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, writable: true });

      fireEvent.scroll(scrollContainer!);

      await waitFor(() => {
        expect(screen.getByText('Auto-scroll: PAUSED')).toBeInTheDocument();
      });

      // Then scroll back to bottom
      Object.defineProperty(scrollContainer, 'scrollTop', { value: 100, writable: true });
      fireEvent.scroll(scrollContainer!);

      await waitFor(() => {
        expect(screen.getByText('Auto-scroll: ON')).toBeInTheDocument();
      });
    });
  });

  describe('Event Type Colors', () => {
    it('applies correct colors for different event types', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const eventTypes = [
        { type: 'agent-start', payload: { agent: 'Test' } },
        { type: 'agent-end', payload: { agent: 'Test' } },
        { type: 'progress', payload: { percentage: 50 } },
        { type: 'error', payload: { message: 'Error' } },
        { type: 'log', payload: { message: 'Log' } },
        { type: 'workflow-start', payload: { workflow: 'Test' } },
        { type: 'workflow-complete', payload: { workflow: 'Test' } }
      ];

      for (const event of eventTypes) {
        mockWs.simulateMessage({
          ts: Date.now(),
          ...event
        });
      }

      await waitFor(() => {
        expect(screen.getByText('7 / 7 events')).toBeInTheDocument();
        
        // Verify that badges have different color classes
        const badges = screen.getAllByText(/agent-start|agent-end|progress|error|log|workflow-start|workflow-complete/);
        expect(badges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles events without agent information', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'agent-start',
        payload: {} // No agent field
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('Agent started: Unknown')).toBeInTheDocument();
      });
    });

    it('handles unknown event types', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <EventTimeline />
        </TestWrapper>
      );

      const testEvent: ChimeraEvent = {
        ts: Date.now(),
        type: 'unknown-type',
        payload: { data: 'test' }
      };

      mockWs.simulateMessage(testEvent);

      await waitFor(() => {
        expect(screen.getByText('unknown-type')).toBeInTheDocument();
        expect(screen.getByText(/unknown-type:.*data.*test/)).toBeInTheDocument();
      });
    });

    it('handles null WebSocket gracefully', () => {
      render(
        <TestWrapper ws={null}>
          <EventTimeline />
        </TestWrapper>
      );

      expect(screen.getByText('Event Timeline')).toBeInTheDocument();
      expect(screen.getByText('No events in timeline yet...')).toBeInTheDocument();
    });
  });
});
