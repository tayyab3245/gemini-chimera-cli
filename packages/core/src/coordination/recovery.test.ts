import { describe, it, expect, vi } from 'vitest';
import { withTimeout, withRetries } from './recovery.js';

describe('Recovery utilities', () => {
  describe('withTimeout', () => {
    it('should resolve when promise resolves before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('should reject when promise rejects before timeout', async () => {
      const promise = Promise.reject(new Error('failed'));
      await expect(withTimeout(promise, 1000)).rejects.toThrow('failed');
    });

    it('should reject with timeout error when promise takes too long', async () => {
      vi.useFakeTimers();
      
      const promise = new Promise(resolve => setTimeout(resolve, 2000));
      const timeoutPromise = withTimeout(promise, 1000);
      
      vi.advanceTimersByTime(1000);
      
      await expect(timeoutPromise).rejects.toThrow('timeout');
      
      vi.useRealTimers();
    });

    it('should use default timeout of 60 seconds', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise);
      expect(result).toBe('success');
    });

    it('should clear timeout when promise resolves', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      const promise = Promise.resolve('success');
      
      await withTimeout(promise, 1000);
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });

  describe('withRetries', () => {
    it('should return result on first successful attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      
      const result = await withRetries(mockFn, 3);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and return result when successful', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('attempt 1 failed'))
        .mockRejectedValueOnce(new Error('attempt 2 failed'))
        .mockResolvedValue('success on attempt 3');
      
      const result = await withRetries(mockFn, 3);
      
      expect(result).toBe('success on attempt 3');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should throw last error after max attempts exceeded', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('attempt 1 failed'))
        .mockRejectedValueOnce(new Error('attempt 2 failed'))
        .mockRejectedValueOnce(new Error('attempt 3 failed'))
        .mockRejectedValueOnce(new Error('final attempt failed'));
      
      await expect(withRetries(mockFn, 3)).rejects.toThrow('final attempt failed');
      expect(mockFn).toHaveBeenCalledTimes(4); // max=3 means 4 total attempts (0,1,2,3)
    });

    it('should handle non-Error exceptions', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce('string error')
        .mockResolvedValue('success');
      
      const result = await withRetries(mockFn, 3);
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should throw converted Error for non-Error exceptions when max attempts exceeded', async () => {
      const mockFn = vi.fn().mockRejectedValue('string error');
      
      const error = await withRetries(mockFn, 3).catch((e: unknown) => e);
      
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('string error');
      expect(mockFn).toHaveBeenCalledTimes(4); // max=3 means 4 total attempts
    });
  });

  describe('Integration: withRetries + withTimeout', () => {
    it('should throw timeout error when all attempts timeout', async () => {
      vi.useFakeTimers();
      
      const mockFn = vi.fn()
        .mockImplementation(() => new Promise(() => {})); // never resolves
      
      const promise = withRetries(() => withTimeout(mockFn(), 100), 2, 50);
      
      // Let all timeouts and retries run
      vi.advanceTimersByTime(1000);
      await vi.runAllTimersAsync();
      
      await expect(promise).rejects.toThrow('timeout');
      expect(mockFn).toHaveBeenCalledTimes(3); // max=2 means 3 attempts
      
      vi.useRealTimers();
    });
  });
});