/**
 * Wraps a promise with a timeout, rejecting with 'timeout' error after specified milliseconds
 */
export function withTimeout<T>(p: Promise<T>, ms = 60_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('timeout'));
    }, ms);

    p.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeoutId);
        reject(error);
      }
    );
  });
}

/**
 * Retries a function with exponential back-off:
 * - Attempt 0: immediate
 * - Attempt 1: 250ms delay
 * - Attempt 2: 500ms delay  
 * - Attempt 3: 1000ms delay
 * Throws the last error after max attempts
 */
export async function withRetries<T>(
  fn: () => Promise<T>,
  max = 3,
  baseDelayMs = 250,
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 0; attempt <= max; attempt++) {
    try {
      // First attempt is immediate (no delay)
      if (attempt > 0) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
      
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // If this was the last attempt, throw the error
      if (attempt === max) {
        throw lastError;
      }
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError!;
}
