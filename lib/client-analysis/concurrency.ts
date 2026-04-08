// Simple semaphore for limiting parallel operations (no p-limit dep).
// Used to cap concurrent Whisper API calls at 3 per cron invocation.

export function createLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    if (active < maxConcurrent && queue.length > 0) {
      active++;
      const resolve = queue.shift();
      if (resolve) resolve();
    }
  };

  return async <T>(fn: () => Promise<T>): Promise<T> => {
    await new Promise<void>((resolve) => {
      queue.push(resolve);
      next();
    });
    try {
      return await fn();
    } finally {
      active--;
      next();
    }
  };
}
