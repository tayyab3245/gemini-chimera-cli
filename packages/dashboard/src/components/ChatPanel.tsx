import React, { useState, useRef, useEffect } from 'react';
import { useEvents } from '../contexts/EventContext';

// Simple markdown parser for basic formatting
const parseMarkdown = (text: string): React.ReactElement => {
  // Replace **bold** with <strong>
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Replace `code` with <code>
  html = html.replace(/`(.*?)`/g, '<code class="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-xs">$1</code>');
  
  // Replace links [text](url) with <a>
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 underline">$1</a>');
  
  // Replace newlines with <br>
  html = html.replace(/\n/g, '<br>');
  
  return <div className="text-sm" dangerouslySetInnerHTML={{ __html: html }} />;
};

export const ChatPanel: React.FC = () => {
  const { chatMessages, sendChatMessage } = useEvents();
  const [inputText, setInputText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    if (messagesEndRef.current && typeof messagesEndRef.current.scrollIntoView === 'function') {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedText = inputText.trim();
    if (!trimmedText) return;

    sendChatMessage(trimmedText);
    setInputText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <div className="flex flex-col h-screen bg-white border-l border-gray-200">
      {/* Header */}
      <div className="flex-shrink-0 bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Kernel Chat</h2>
        <p className="text-sm text-gray-600">Converse with the Kernel in real-time</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" data-testid="chat-messages">
        {chatMessages.length === 0 ? (
          <div className="text-center text-gray-500 mt-8" data-testid="empty-state">
            <p>No messages yet.</p>
            <p className="text-sm">Start a conversation with the Kernel below.</p>
          </div>
        ) : (
          chatMessages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              data-testid={`chat-message-${message.sender}`}
            >
              <div
                className={`max-w-3xl rounded-lg px-4 py-2 ${
                  message.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium">
                    {message.sender === 'user' ? 'You' : 'Kernel'}
                  </span>
                  <span className={`text-xs ${
                    message.sender === 'user' ? 'text-blue-200' : 'text-gray-500'
                  }`}>
                    {formatTimestamp(message.timestamp)}
                  </span>
                </div>
                <div className="prose prose-sm max-w-none">
                  {message.sender === 'kernel' ? (
                    parseMarkdown(message.text)
                  ) : (
                    <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to the Kernel..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            data-testid="chat-input"
            maxLength={1000}
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            data-testid="send-button"
          >
            Send
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send • Shift+Enter for new line • Last 50 messages saved
        </p>
      </div>
    </div>
  );
};

export default ChatPanel;
