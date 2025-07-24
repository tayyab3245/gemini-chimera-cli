import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import TimelineFilterBar from './TimelineFilterBar';
import { EventProvider, FilterState } from '../contexts/EventContext';

class MockWebSocket {
  constructor(url: string) {
    this.url = url;
    this.readyState = WebSocket.OPEN;
  }

  url: string;
  readyState: number;
  addEventListener = () => {};
  removeEventListener = () => {};
  send = () => {};
  close = () => {};
}

interface TestWrapperProps {
  children: React.ReactNode;
  ws?: WebSocket | null;
}

const TestWrapper: React.FC<TestWrapperProps> = ({ 
  children, 
  ws = new MockWebSocket('ws://localhost:4000/events') as unknown as WebSocket 
}) => (
  <EventProvider ws={ws}>
    {children}
  </EventProvider>
);

describe('TimelineFilterBar', () => {
  beforeEach(() => {
    // Reset any global state if needed
  });

  it('renders filter bar with all components', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Check main title
    expect(screen.getByText('Timeline Filters')).toBeInTheDocument();
    
    // Check search input
    expect(screen.getByLabelText('Search Events')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type to search event payload or type...')).toBeInTheDocument();
    
    // Check section labels
    expect(screen.getByText('Agent Filters')).toBeInTheDocument();
    expect(screen.getByText('Event Type Filters')).toBeInTheDocument();
  });

  it('renders all agent filter buttons', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Check all agent buttons are present
    expect(screen.getByRole('button', { name: 'KERNEL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'SYNTH' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'DRIVE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'AUDIT' })).toBeInTheDocument();
  });

  it('renders all event type filter buttons', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Check all event type buttons are present
    expect(screen.getByRole('button', { name: 'log' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'agent-start' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'agent-end' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'error' })).toBeInTheDocument();
  });

  it('all filters start in active state by default', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Agent buttons should be active (colored)
    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    const synthBtn = screen.getByRole('button', { name: 'SYNTH' });
    const driveBtn = screen.getByRole('button', { name: 'DRIVE' });
    const auditBtn = screen.getByRole('button', { name: 'AUDIT' });

    expect(kernelBtn).toHaveClass('bg-blue-500', 'text-white');
    expect(synthBtn).toHaveClass('bg-green-500', 'text-white');
    expect(driveBtn).toHaveClass('bg-yellow-500', 'text-white');
    expect(auditBtn).toHaveClass('bg-red-500', 'text-white');

    // Event type buttons should be active
    const logBtn = screen.getByRole('button', { name: 'log' });
    const progressBtn = screen.getByRole('button', { name: 'progress' });
    const errorBtn = screen.getByRole('button', { name: 'error' });

    expect(logBtn).toHaveClass('bg-gray-500', 'text-white');
    expect(progressBtn).toHaveClass('bg-green-500', 'text-white');
    expect(errorBtn).toHaveClass('bg-red-500', 'text-white');
  });

  it('toggles agent filter when clicked', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    
    // Should start active
    expect(kernelBtn).toHaveClass('bg-blue-500', 'text-white');
    
    // Click to deactivate
    fireEvent.click(kernelBtn);
    expect(kernelBtn).toHaveClass('bg-gray-200', 'text-gray-500');
    
    // Click to reactivate
    fireEvent.click(kernelBtn);
    expect(kernelBtn).toHaveClass('bg-blue-500', 'text-white');
  });

  it('toggles event type filter when clicked', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const errorBtn = screen.getByRole('button', { name: 'error' });
    
    // Should start active
    expect(errorBtn).toHaveClass('bg-red-500', 'text-white');
    
    // Click to deactivate
    fireEvent.click(errorBtn);
    expect(errorBtn).toHaveClass('bg-gray-200', 'text-gray-500');
    
    // Click to reactivate
    fireEvent.click(errorBtn);
    expect(errorBtn).toHaveClass('bg-red-500', 'text-white');
  });

  it('does not show clear all button when no filters are active', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // By default, all filters are active, so no "clear all" should be visible
    expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
  });

  it('shows clear all button when filters are applied', async () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Type in search query
    const searchInput = screen.getByLabelText('Search Events');
    fireEvent.change(searchInput, { target: { value: 'test query' } });

    // Wait for debounce and Clear All button to appear
    await waitFor(() => {
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });
  });

  it('shows clear all button when agent is deactivated', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Deactivate an agent
    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    fireEvent.click(kernelBtn);

    // Clear All button should appear
    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  it('shows clear all button when event type is deactivated', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Deactivate an event type
    const errorBtn = screen.getByRole('button', { name: 'error' });
    fireEvent.click(errorBtn);

    // Clear All button should appear
    expect(screen.getByText('Clear All')).toBeInTheDocument();
  });

  it('handles search input with debouncing', async () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const searchInput = screen.getByLabelText('Search Events');
    
    // Type rapidly
    fireEvent.change(searchInput, { target: { value: 'test' } });
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    
    // Value should update immediately in the input
    expect(searchInput).toHaveValue('test query');
    
    // Wait for debounce
    await waitFor(() => {
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    }, { timeout: 500 });
  });

  it('clears all filters when clear all button is clicked', async () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const searchInput = screen.getByLabelText('Search Events');
    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    const errorBtn = screen.getByRole('button', { name: 'error' });

    // Apply some filters
    fireEvent.change(searchInput, { target: { value: 'test query' } });
    fireEvent.click(kernelBtn); // deactivate
    fireEvent.click(errorBtn); // deactivate

    // Wait for clear all button to appear
    await waitFor(() => {
      expect(screen.getByText('Clear All')).toBeInTheDocument();
    });

    // Click clear all
    fireEvent.click(screen.getByText('Clear All'));

    // All filters should be reset
    expect(searchInput).toHaveValue('');
    expect(kernelBtn).toHaveClass('bg-blue-500', 'text-white');
    expect(errorBtn).toHaveClass('bg-red-500', 'text-white');
    expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
  });

  it('maintains individual agent color schemes', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Check each agent has correct active colors
    expect(screen.getByRole('button', { name: 'KERNEL' })).toHaveClass('bg-blue-500');
    expect(screen.getByRole('button', { name: 'SYNTH' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'DRIVE' })).toHaveClass('bg-yellow-500');
    expect(screen.getByRole('button', { name: 'AUDIT' })).toHaveClass('bg-red-500');
  });

  it('maintains individual event type color schemes', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Check each event type has correct active colors
    expect(screen.getByRole('button', { name: 'log' })).toHaveClass('bg-gray-500');
    expect(screen.getByRole('button', { name: 'progress' })).toHaveClass('bg-green-500');
    expect(screen.getByRole('button', { name: 'agent-start' })).toHaveClass('bg-blue-500');
    expect(screen.getByRole('button', { name: 'agent-end' })).toHaveClass('bg-blue-500');
    expect(screen.getByRole('button', { name: 'error' })).toHaveClass('bg-red-500');
  });

  it('toggles multiple agents independently', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    const synthBtn = screen.getByRole('button', { name: 'SYNTH' });

    // Deactivate KERNEL
    fireEvent.click(kernelBtn);
    expect(kernelBtn).toHaveClass('bg-gray-200', 'text-gray-500');
    expect(synthBtn).toHaveClass('bg-green-500', 'text-white'); // SYNTH stays active

    // Deactivate SYNTH  
    fireEvent.click(synthBtn);
    expect(synthBtn).toHaveClass('bg-gray-200', 'text-gray-500');
    expect(kernelBtn).toHaveClass('bg-gray-200', 'text-gray-500'); // KERNEL stays inactive
  });

  it('toggles multiple event types independently', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const logBtn = screen.getByRole('button', { name: 'log' });
    const errorBtn = screen.getByRole('button', { name: 'error' });

    // Deactivate log
    fireEvent.click(logBtn);
    expect(logBtn).toHaveClass('bg-gray-200', 'text-gray-500');
    expect(errorBtn).toHaveClass('bg-red-500', 'text-white'); // error stays active

    // Deactivate error
    fireEvent.click(errorBtn);
    expect(errorBtn).toHaveClass('bg-gray-200', 'text-gray-500');
    expect(logBtn).toHaveClass('bg-gray-200', 'text-gray-500'); // log stays inactive
  });

  it('handles empty search input correctly', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const searchInput = screen.getByLabelText('Search Events');
    
    // Type something then clear it
    fireEvent.change(searchInput, { target: { value: 'test' } });
    fireEvent.change(searchInput, { target: { value: '' } });
    
    expect(searchInput).toHaveValue('');
    // Clear All button should not be visible with just empty search
    expect(screen.queryByText('Clear All')).not.toBeInTheDocument();
  });

  it('handles rapid filter changes without errors', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    const synthBtn = screen.getByRole('button', { name: 'SYNTH' });
    const errorBtn = screen.getByRole('button', { name: 'error' });

    // Rapidly toggle multiple filters
    fireEvent.click(kernelBtn);
    fireEvent.click(synthBtn);
    fireEvent.click(errorBtn);
    fireEvent.click(kernelBtn);
    fireEvent.click(synthBtn);

    // Should not crash and final states should be correct
    expect(kernelBtn).toHaveClass('bg-blue-500', 'text-white'); // back to active
    expect(synthBtn).toHaveClass('bg-green-500', 'text-white'); // back to active  
    expect(errorBtn).toHaveClass('bg-gray-200', 'text-gray-500'); // inactive
  });

  it('applies correct accessibility attributes', () => {
    render(
      <TestWrapper>
        <TimelineFilterBar />
      </TestWrapper>
    );

    // Search input should have proper labeling
    const searchInput = screen.getByLabelText('Search Events');
    expect(searchInput).toHaveAttribute('id', 'filter-query');
    expect(searchInput).toHaveAttribute('type', 'text');

    // All buttons should be focusable
    const kernelBtn = screen.getByRole('button', { name: 'KERNEL' });
    expect(kernelBtn).toBeInTheDocument();
    expect(kernelBtn.tagName).toBe('BUTTON');
  });
});
