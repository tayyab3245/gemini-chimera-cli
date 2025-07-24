import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ThemeToggle from './ThemeToggle';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Mock matchMedia
const matchMediaMock = vi.fn();

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();
    
    // Reset DOM
    document.documentElement.className = '';
    
    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
    });

    // Mock matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: matchMediaMock,
    });

    // Default matchMedia mock (prefers light)
    matchMediaMock.mockReturnValue({
      matches: false,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    });
  });

  afterEach(() => {
    document.documentElement.className = '';
  });

  describe('Rendering', () => {
    it('renders the theme toggle button', () => {
      localStorageMock.getItem.mockReturnValue(null);
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute('aria-label', 'Switch to dark theme');
    });

    it('renders moon icon in light mode', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
      expect(screen.queryByTestId('sun-icon')).not.toBeInTheDocument();
    });

    it('renders sun icon in dark mode', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
        expect(screen.queryByTestId('moon-icon')).not.toBeInTheDocument();
      });
    });
  });

  describe('Theme Initialization', () => {
    it('initializes with light theme when no saved preference', () => {
      localStorageMock.getItem.mockReturnValue(null);
      matchMediaMock.mockReturnValue({ matches: false });
      
      render(<ThemeToggle />);
      
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    });

    it('initializes with dark theme when saved preference is dark', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      });
    });

    it('initializes with light theme when saved preference is light', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
    });

    it('respects system preference when no saved preference', async () => {
      localStorageMock.getItem.mockReturnValue(null);
      matchMediaMock.mockReturnValue({ matches: true }); // System prefers dark
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      });
    });
  });

  describe('Theme Toggling', () => {
    it('toggles from light to dark mode', async () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-label', 'Switch to light theme');
      });
    });

    it('toggles from dark to light mode', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      });
      
      const button = screen.getByTestId('theme-toggle');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light');
        expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
        expect(button).toHaveAttribute('aria-label', 'Switch to dark theme');
      });
    });

    it('toggles multiple times correctly', async () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      
      // First toggle: light to dark
      fireEvent.click(button);
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      });
      
      // Second toggle: dark to light
      fireEvent.click(button);
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(screen.getByTestId('moon-icon')).toBeInTheDocument();
      });
      
      // Third toggle: light to dark again
      fireEvent.click(button);
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(screen.getByTestId('sun-icon')).toBeInTheDocument();
      });
    });
  });

  describe('Persistence', () => {
    it('saves theme preference to localStorage', async () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'dark');
      });
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith('theme', 'light');
      });
    });

    it('reads theme preference from localStorage on mount', () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      expect(localStorageMock.getItem).toHaveBeenCalledWith('theme');
    });
  });

  describe('DOM Manipulation', () => {
    it('adds dark class to html element in dark mode', async () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      expect(document.documentElement.classList.contains('dark')).toBe(false);
      
      const button = screen.getByTestId('theme-toggle');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
    });

    it('removes dark class from html element in light mode', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
      });
      
      const button = screen.getByTestId('theme-toggle');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
      });
    });

    it('handles existing classes on html element', async () => {
      document.documentElement.className = 'existing-class another-class';
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(true);
        expect(document.documentElement.classList.contains('existing-class')).toBe(true);
        expect(document.documentElement.classList.contains('another-class')).toBe(true);
      });
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(document.documentElement.classList.contains('dark')).toBe(false);
        expect(document.documentElement.classList.contains('existing-class')).toBe(true);
        expect(document.documentElement.classList.contains('another-class')).toBe(true);
      });
    });
  });

  describe('Accessibility', () => {
    it('has proper aria-label for light mode', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button).toHaveAttribute('aria-label', 'Switch to dark theme');
    });

    it('has proper aria-label for dark mode', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        const button = screen.getByTestId('theme-toggle');
        expect(button).toHaveAttribute('aria-label', 'Switch to light theme');
      });
    });

    it('updates aria-label when toggling', async () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button).toHaveAttribute('aria-label', 'Switch to dark theme');
      
      fireEvent.click(button);
      
      await waitFor(() => {
        expect(button).toHaveAttribute('aria-label', 'Switch to light theme');
      });
    });

    it('is keyboard accessible', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button.tagName).toBe('BUTTON');
      expect(button).not.toHaveAttribute('disabled');
    });
  });

  describe('Visual Styling', () => {
    it('applies correct CSS classes', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button).toHaveClass('p-2', 'rounded-lg', 'bg-gray-100', 'hover:bg-gray-200');
    });

    it('applies dark mode specific classes', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button).toHaveClass('dark:bg-gray-800', 'dark:hover:bg-gray-700');
    });

    it('includes transition classes', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const button = screen.getByTestId('theme-toggle');
      expect(button).toHaveClass('transition-colors', 'duration-200');
    });
  });

  describe('Icon Styling', () => {
    it('sun icon has correct styling', async () => {
      localStorageMock.getItem.mockReturnValue('dark');
      
      render(<ThemeToggle />);
      
      await waitFor(() => {
        const sunIcon = screen.getByTestId('sun-icon');
        expect(sunIcon).toHaveClass('text-yellow-500');
        expect(sunIcon).toHaveAttribute('width', '20');
        expect(sunIcon).toHaveAttribute('height', '20');
      });
    });

    it('moon icon has correct styling', () => {
      localStorageMock.getItem.mockReturnValue('light');
      
      render(<ThemeToggle />);
      
      const moonIcon = screen.getByTestId('moon-icon');
      expect(moonIcon).toHaveClass('text-gray-700', 'dark:text-gray-300');
      expect(moonIcon).toHaveAttribute('width', '20');
      expect(moonIcon).toHaveAttribute('height', '20');
    });
  });
});
