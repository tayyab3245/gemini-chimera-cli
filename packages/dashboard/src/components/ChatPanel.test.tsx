import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import ChatPanel from './ChatPanel';
import { EventProvider } from '../contexts/EventContext';

// Mock WebSocket
class MockWebSocket {
  readyState: number = WebSocket.OPEN;
  send = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-content">{children}</div>
}));

// Mock scrollIntoView
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe('ChatPanel', () => {
  let mockWs: MockWebSocket;

  const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
      <EventProvider ws={mockWs as unknown as WebSocket}>
        {children}
      </EventProvider>
    );
  };

  beforeEach(() => {
    mockWs = new MockWebSocket();
    localStorageMock.getItem.mockReturnValue(null);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders the ChatPanel component', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      expect(screen.getByText('Kernel Chat')).toBeInTheDocument();
      expect(screen.getByText('Converse with the Kernel in real-time')).toBeInTheDocument();
    });

    it('shows empty state when no messages', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('No messages yet.')).toBeInTheDocument();
      expect(screen.getByText('Start a conversation with the Kernel below.')).toBeInTheDocument();
    });

    it('renders chat input and send button', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      expect(screen.getByTestId('chat-input')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Type a message to the Kernel...')).toBeInTheDocument();
    });
  });

  describe('Message Input and Sending', () => {
    it('updates input value when typing', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Hello Kernel' } });

      expect(input.value).toBe('Hello Kernel');
    });

    it('enables send button when input has text', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');

      expect(sendButton).toBeDisabled();

      fireEvent.change(input, { target: { value: 'Hello' } });
      expect(sendButton).not.toBeDisabled();

      fireEvent.change(input, { target: { value: '' } });
      expect(sendButton).toBeDisabled();
    });

    it('sends message when form is submitted', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'chat', text: 'Test message' })
      );
    });

    it('sends message when Enter key is pressed', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Enter test' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ action: 'chat', text: 'Enter test' })
      );
    });

    it('does not send message when Shift+Enter is pressed', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Shift enter test' } });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });

      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('clears input after sending message', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input') as HTMLInputElement;
      const sendButton = screen.getByTestId('send-button');

      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.click(sendButton);

      expect(input.value).toBe('');
    });

    it('does not send empty or whitespace-only messages', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');

      // Test empty message
      fireEvent.change(input, { target: { value: '' } });
      fireEvent.click(sendButton);
      expect(mockWs.send).not.toHaveBeenCalled();

      // Test whitespace-only message
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(sendButton);
      expect(mockWs.send).not.toHaveBeenCalled();
    });
  });

  describe('Message Display', () => {
    it('displays user messages with correct styling', async () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'User message' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(screen.getByTestId('chat-message-user')).toBeInTheDocument();
        expect(screen.getByText('User message')).toBeInTheDocument();
        expect(screen.getByText('You')).toBeInTheDocument();
      });
    });

    it('displays kernel messages with markdown rendering', async () => {
      // Set up localStorage with a kernel message
      const messages = [
        {
          id: 'test-1',
          timestamp: Date.now(),
          text: 'Hello with `code` and **bold**',
          sender: 'kernel'
        }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(messages));

      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('chat-message-kernel')).toBeInTheDocument();
        expect(screen.getByTestId('markdown-content')).toBeInTheDocument();
        expect(screen.getByText('Kernel')).toBeInTheDocument();
      });
    });

    it('formats timestamps correctly', async () => {
      const testTime = new Date('2023-01-01T12:30:45').getTime();
      const messages = [
        {
          id: 'test-1',
          timestamp: testTime,
          text: 'Test message',
          sender: 'user'
        }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(messages));

      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('12:30:45')).toBeInTheDocument();
      });
    });
  });

  describe('Persistence', () => {
    it('loads messages from localStorage on mount', () => {
      const savedMessages = [
        {
          id: 'saved-1',
          timestamp: Date.now(),
          text: 'Saved message',
          sender: 'user'
        }
      ];
      localStorageMock.getItem.mockReturnValue(JSON.stringify(savedMessages));

      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      expect(localStorageMock.getItem).toHaveBeenCalledWith('chimera-chat-messages');
      expect(screen.getByText('Saved message')).toBeInTheDocument();
    });

    it('handles invalid localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');

      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      // Should not crash and show empty state
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });

    it('saves messages to localStorage when added', async () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(
          'chimera-chat-messages',
          expect.stringContaining('"text":"Test message"')
        );
      });
    });
  });

  describe('WebSocket Integration', () => {
    it('handles WebSocket not connected gracefully', () => {
      mockWs.readyState = WebSocket.CLOSED;

      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      fireEvent.change(input, { target: { value: 'Test message' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(mockWs.send).not.toHaveBeenCalled();
    });

    it('respects maxLength attribute on input', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      expect(input).toHaveAttribute('maxLength', '1000');
    });
  });

  describe('UI Behavior', () => {
    it('focuses input after sending message', async () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');
      const sendButton = screen.getByTestId('send-button');

      fireEvent.change(input, { target: { value: 'Test focus' } });
      fireEvent.click(sendButton);

      await waitFor(() => {
        expect(input).toHaveFocus();
      });
    });

    it('shows helper text for keyboard shortcuts', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      expect(screen.getByText(/Press Enter to send/)).toBeInTheDocument();
      expect(screen.getByText(/Last 50 messages saved/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles rapid message sending without errors', async () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const input = screen.getByTestId('chat-input');

      // Send multiple messages rapidly
      for (let i = 0; i < 5; i++) {
        fireEvent.change(input, { target: { value: `Message ${i}` } });
        fireEvent.keyDown(input, { key: 'Enter' });
      }

      expect(mockWs.send).toHaveBeenCalledTimes(5);
    });

    it('maintains scroll position behavior', () => {
      render(
        <TestWrapper>
          <ChatPanel />
        </TestWrapper>
      );

      const messagesContainer = screen.getByTestId('chat-messages');
      expect(messagesContainer).toBeInTheDocument();
    });
  });
});
