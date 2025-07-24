import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ControlPanel from './ControlPanel';
import { WebSocketProvider } from '../contexts/WebSocketContext';

// Mock WebSocket for testing
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState: number;
  sentMessages: string[] = [];
  url: string;

  constructor(url: string, readyState: number = MockWebSocket.OPEN) {
    this.url = url;
    this.readyState = readyState;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }

  // Helper method to get sent messages
  getSentMessages() {
    return this.sentMessages;
  }

  // Helper method to clear sent messages
  clearSentMessages() {
    this.sentMessages = [];
  }
}

// Test wrapper component
interface TestWrapperProps {
  ws?: MockWebSocket | null;
  connectionStatus?: 'connecting' | 'connected' | 'disconnected';
  children: React.ReactNode;
}

const TestWrapper: React.FC<TestWrapperProps> = ({ 
  ws = null, 
  connectionStatus = 'disconnected', 
  children 
}) => (
  <WebSocketProvider ws={ws as any} connectionStatus={connectionStatus}>
    {children}
  </WebSocketProvider>
);

describe('ControlPanel', () => {
  let mockWs: MockWebSocket;
  const user = userEvent.setup();

  beforeEach(() => {
    mockWs = new MockWebSocket('ws://localhost:4000/events', MockWebSocket.OPEN);
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the ControlPanel component', () => {
      render(
        <TestWrapper>
          <ControlPanel />
        </TestWrapper>
      );

      expect(screen.getByText('Workflow Controls')).toBeInTheDocument();
    });

    it('renders Pause and Resume buttons', () => {
      render(
        <TestWrapper>
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toBeInTheDocument();
      expect(resumeButton).toBeInTheDocument();
    });

    it('displays correct status message when connected', () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      expect(screen.getByText('Send pause/resume commands to the workflow engine')).toBeInTheDocument();
    });

    it('displays disabled message when not connected', () => {
      render(
        <TestWrapper connectionStatus="disconnected">
          <ControlPanel />
        </TestWrapper>
      );

      expect(screen.getByText('Controls disabled - WebSocket not connected')).toBeInTheDocument();
    });
  });

  describe('Button States', () => {
    it('enables buttons when WebSocket is connected and ready', () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).not.toBeDisabled();
      expect(resumeButton).not.toBeDisabled();
    });

    it('disables buttons when WebSocket is disconnected', () => {
      render(
        <TestWrapper connectionStatus="disconnected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toBeDisabled();
      expect(resumeButton).toBeDisabled();
    });

    it('disables buttons when WebSocket is connecting', () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connecting">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toBeDisabled();
      expect(resumeButton).toBeDisabled();
    });

    it('disables buttons when WebSocket exists but readyState is not OPEN', () => {
      const closedWs = new MockWebSocket('ws://localhost:4000/events', MockWebSocket.CLOSED);
      
      render(
        <TestWrapper ws={closedWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toBeDisabled();
      expect(resumeButton).toBeDisabled();
    });

    it('disables buttons when WebSocket is null', () => {
      render(
        <TestWrapper ws={null} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toBeDisabled();
      expect(resumeButton).toBeDisabled();
    });
  });

  describe('Message Emission', () => {
    beforeEach(() => {
      // Ensure mockWs is clean for each test
      mockWs.clearSentMessages();
    });

    it('sends exactly {action:"pause"} when Pause button is clicked', async () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      
      await user.click(pauseButton);

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toBe('{"action":"pause"}');
    });

    it('sends exactly {action:"resume"} when Resume button is clicked', async () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const resumeButton = screen.getByRole('button', { name: /resume/i });
      
      await user.click(resumeButton);

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0]).toBe('{"action":"resume"}');
    });

    it('sends multiple messages when buttons are clicked multiple times', async () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });
      
      await user.click(pauseButton);
      await user.click(resumeButton);
      await user.click(pauseButton);

      const sentMessages = mockWs.getSentMessages();
      expect(sentMessages).toHaveLength(3);
      expect(sentMessages[0]).toBe('{"action":"pause"}');
      expect(sentMessages[1]).toBe('{"action":"resume"}');
      expect(sentMessages[2]).toBe('{"action":"pause"}');
    });

    it('does not send messages when buttons are disabled', async () => {
      render(
        <TestWrapper connectionStatus="disconnected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });
      
      // Try to click disabled buttons
      await user.click(pauseButton);
      await user.click(resumeButton);

      // Should have no WebSocket, so no messages sent
      expect(mockWs.getSentMessages()).toHaveLength(0);
    });

    it('logs control actions to console', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });
      
      await user.click(pauseButton);
      await user.click(resumeButton);

      expect(consoleSpy).toHaveBeenCalledWith('Sent control action: pause');
      expect(consoleSpy).toHaveBeenCalledWith('Sent control action: resume');

      consoleSpy.mockRestore();
    });
  });

  describe('WebSocket Edge Cases', () => {
    it('handles WebSocket state changes gracefully', async () => {
      const { rerender } = render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      // Initially enabled
      expect(screen.getByRole('button', { name: /pause/i })).not.toBeDisabled();

      // Change to disconnected
      rerender(
        <TestWrapper ws={null} connectionStatus="disconnected">
          <ControlPanel />
        </TestWrapper>
      );

      // Should now be disabled
      expect(screen.getByRole('button', { name: /pause/i })).toBeDisabled();
    });

    it('handles WebSocket readyState changes', () => {
      const connectingWs = new MockWebSocket('ws://localhost:4000/events', MockWebSocket.CONNECTING);
      
      render(
        <TestWrapper ws={connectingWs} connectionStatus="connecting">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      expect(pauseButton).toBeDisabled();
    });
  });

  describe('UI Styling', () => {
    it('applies correct styling for enabled buttons', () => {
      render(
        <TestWrapper ws={mockWs} connectionStatus="connected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toHaveClass('bg-yellow-500');
      expect(resumeButton).toHaveClass('bg-green-500');
    });

    it('applies correct styling for disabled buttons', () => {
      render(
        <TestWrapper connectionStatus="disconnected">
          <ControlPanel />
        </TestWrapper>
      );

      const pauseButton = screen.getByRole('button', { name: /pause/i });
      const resumeButton = screen.getByRole('button', { name: /resume/i });

      expect(pauseButton).toHaveClass('bg-gray-300');
      expect(resumeButton).toHaveClass('bg-gray-300');
    });
  });
});
