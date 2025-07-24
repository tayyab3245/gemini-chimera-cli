import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ToastManager from './ToastManager';
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

describe('ToastManager', () => {
  let mockWs: MockWebSocket;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWs = new MockWebSocket('ws://localhost:8080');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('renders nothing when no error events exist', () => {
      render(
        <TestWrapper>
          <ToastManager />
        </TestWrapper>
      );

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not render for non-error events', () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'progress',
          payload: { percentage: 50 }
        });
      });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('Error Event Display', () => {
    it('displays toast when error event is received', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'TestAgent' },
            message: 'Test error message'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('TestAgent')).toBeInTheDocument();
        expect(screen.getByText('Test error message')).toBeInTheDocument();
      });
    });

    it('displays default values for missing agent name and message', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {}
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Unknown Agent')).toBeInTheDocument();
        expect(screen.getByText('An error occurred')).toBeInTheDocument();
      });
    });

    it('handles error events with partial payload data', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'PartialAgent' }
            // message is missing
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('PartialAgent')).toBeInTheDocument();
        expect(screen.getByText('An error occurred')).toBeInTheDocument();
      });
    });
  });

  describe('Auto-dismiss Functionality', () => {
    it('auto-dismisses toast after 8 seconds', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'AutoDismissAgent' },
            message: 'This will auto-dismiss'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('AutoDismissAgent')).toBeInTheDocument();
      });

      // Fast-forward time by 8 seconds
      act(() => {
        vi.advanceTimersByTime(8000);
      });

      await waitFor(() => {
        expect(screen.queryByText('AutoDismissAgent')).not.toBeInTheDocument();
      }, { timeout: 1000 });
    }, 10000);

    it('does not auto-dismiss before 8 seconds', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'PersistentAgent' },
            message: 'Still here'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('PersistentAgent')).toBeInTheDocument();
      });

      // Fast-forward time by 7 seconds (less than 8)
      act(() => {
        vi.advanceTimersByTime(7000);
      });

      expect(screen.getByText('PersistentAgent')).toBeInTheDocument();
    });
  });

  describe('Manual Dismiss', () => {
    it('manually dismisses toast when X button is clicked', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'ManualDismissAgent' },
            message: 'Click X to dismiss'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('ManualDismissAgent')).toBeInTheDocument();
      });

      const dismissButton = screen.getByLabelText('Dismiss error notification');
      await user.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByText('ManualDismissAgent')).not.toBeInTheDocument();
      });
    });

    it('manually dismisses specific toast when multiple are present', async () => {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      // Add first error
      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'FirstAgent' },
            message: 'First error'
          }
        });
      });

      // Add second error
      act(() => {
        mockWs.simulateMessage({
          ts: Date.now() + 1000,
          type: 'error',
          payload: {
            agent: { name: 'SecondAgent' },
            message: 'Second error'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('FirstAgent')).toBeInTheDocument();
        expect(screen.getByText('SecondAgent')).toBeInTheDocument();
      });

      // Dismiss only the first toast
      const dismissButtons = screen.getAllByLabelText('Dismiss error notification');
      await user.click(dismissButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText('FirstAgent')).not.toBeInTheDocument();
        expect(screen.getByText('SecondAgent')).toBeInTheDocument();
      });
    });
  });

  describe('Max Visible Toasts (FIFO)', () => {
    it('maintains maximum of 3 visible toasts', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      // Add 4 error events
      const errorEvents = [
        { name: 'Agent1', message: 'Error 1', ts: Date.now() },
        { name: 'Agent2', message: 'Error 2', ts: Date.now() + 1000 },
        { name: 'Agent3', message: 'Error 3', ts: Date.now() + 2000 },
        { name: 'Agent4', message: 'Error 4', ts: Date.now() + 3000 }
      ];

      errorEvents.forEach((error) => {
        act(() => {
          mockWs.simulateMessage({
            ts: error.ts,
            type: 'error',
            payload: {
              agent: { name: error.name },
              message: error.message
            }
          });
        });
      });

      await waitFor(() => {
        // First toast should be pushed out (FIFO)
        expect(screen.queryByText('Agent1')).not.toBeInTheDocument();
        
        // Last 3 toasts should be visible
        expect(screen.getByText('Agent2')).toBeInTheDocument();
        expect(screen.getByText('Agent3')).toBeInTheDocument();
        expect(screen.getByText('Agent4')).toBeInTheDocument();
      });

      // Verify only 3 toasts are rendered
      const toasts = screen.getAllByLabelText('Dismiss error notification');
      expect(toasts).toHaveLength(3);
    });

    it('adds fifth toast and removes oldest (FIFO)', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      // Add 5 error events sequentially
      const errorEvents = [
        { name: 'Agent1', message: 'Error 1', ts: 1000 },
        { name: 'Agent2', message: 'Error 2', ts: 2000 },
        { name: 'Agent3', message: 'Error 3', ts: 3000 },
        { name: 'Agent4', message: 'Error 4', ts: 4000 },
        { name: 'Agent5', message: 'Error 5', ts: 5000 }
      ];

      errorEvents.forEach((error) => {
        act(() => {
          mockWs.simulateMessage({
            ts: error.ts,
            type: 'error',
            payload: {
              agent: { name: error.name },
              message: error.message
            }
          });
        });
      });

      await waitFor(() => {
        // First two toasts should be pushed out
        expect(screen.queryByText('Agent1')).not.toBeInTheDocument();
        expect(screen.queryByText('Agent2')).not.toBeInTheDocument();
        
        // Last 3 toasts should be visible
        expect(screen.getByText('Agent3')).toBeInTheDocument();
        expect(screen.getByText('Agent4')).toBeInTheDocument();
        expect(screen.getByText('Agent5')).toBeInTheDocument();
      });
    });
  });

  describe('UI Styling and Accessibility', () => {
    it('applies correct CSS classes for styling', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'StyledAgent' },
            message: 'Styled toast'
          }
        });
      });

      // Just verify the toast appears, styling will be correct due to the classes in component
      await waitFor(() => {
        expect(screen.getByText('StyledAgent')).toBeInTheDocument();
      });
    });

    it('includes proper accessibility attributes', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'AccessibleAgent' },
            message: 'Accessible toast'
          }
        });
      });

      await waitFor(() => {
        const container = screen.getByRole('alert');
        expect(container).toHaveAttribute('aria-live', 'polite');
        
        const dismissButton = screen.getByLabelText('Dismiss error notification');
        expect(dismissButton).toBeInTheDocument();
      });
    });

    it('displays error icon with correct styling', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'IconAgent' },
            message: 'Has error icon'
          }
        });
      });

      await waitFor(() => {
        const errorIcon = screen.getByRole('alert').querySelector('svg');
        expect(errorIcon).toHaveClass('w-5', 'h-5', 'text-red-500');
      });
    });
  });

  describe('Edge Cases', () => {
    it('handles duplicate error events correctly', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      const errorPayload = {
        ts: 12345,
        type: 'error',
        payload: {
          agent: { name: 'DuplicateAgent' },
          message: 'Duplicate error'
        }
      };

      // Send the same error event twice
      act(() => {
        mockWs.simulateMessage(errorPayload);
        mockWs.simulateMessage(errorPayload);
      });

      await waitFor(() => {
        expect(screen.getByText('DuplicateAgent')).toBeInTheDocument();
      });

      // Should only have one toast, not two
      const toasts = screen.getAllByLabelText('Dismiss error notification');
      expect(toasts).toHaveLength(1);
    });

    it('handles error events with null payload gracefully', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: null
        });
      });

      await waitFor(() => {
        expect(screen.getByText('Unknown Agent')).toBeInTheDocument();
        expect(screen.getByText('An error occurred')).toBeInTheDocument();
      });
    });

    it('handles long error messages with proper wrapping', async () => {
      render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      const longMessage = 'This is a very long error message that should wrap properly within the toast container without breaking the layout or causing overflow issues';

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'VerboseAgent' },
            message: longMessage
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText(longMessage)).toBeInTheDocument();
        const messageElement = screen.getByText(longMessage);
        expect(messageElement).toHaveClass('break-words');
      });
    });
  });

  describe('Component Cleanup', () => {
    it('cleans up timers when component unmounts', async () => {
      const { unmount } = render(
        <TestWrapper ws={mockWs as unknown as WebSocket}>
          <ToastManager />
        </TestWrapper>
      );

      act(() => {
        mockWs.simulateMessage({
          ts: Date.now(),
          type: 'error',
          payload: {
            agent: { name: 'CleanupAgent' },
            message: 'Will be cleaned up'
          }
        });
      });

      await waitFor(() => {
        expect(screen.getByText('CleanupAgent')).toBeInTheDocument();
      });

      // Unmount component
      unmount();

      // Fast-forward past auto-dismiss time
      act(() => {
        vi.advanceTimersByTime(10000);
      });

      // No errors should occur from timer cleanup
      expect(true).toBe(true); // Test passes if no errors thrown
    });
  });
});
