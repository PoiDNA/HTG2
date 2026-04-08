import { describe, it, expect } from 'vitest';
import { createLimiter } from '../concurrency';

describe('createLimiter', () => {
  it('runs single task immediately', async () => {
    const limit = createLimiter(3);
    const result = await limit(async () => 42);
    expect(result).toBe(42);
  });

  it('caps concurrent active at maxConcurrent', async () => {
    const limit = createLimiter(2);
    let active = 0;
    let maxSeen = 0;

    const task = async (id: number) => {
      active++;
      if (active > maxSeen) maxSeen = active;
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return id;
    };

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => limit(() => task(i))),
    );

    expect(results).toEqual([0, 1, 2, 3, 4, 5]);
    expect(maxSeen).toBeLessThanOrEqual(2);
    expect(maxSeen).toBeGreaterThan(0);
  });

  it('releases slot on error and runs next task', async () => {
    const limit = createLimiter(1);
    let ran = 0;

    await expect(
      limit(async () => {
        ran++;
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    const result = await limit(async () => {
      ran++;
      return 'ok';
    });

    expect(result).toBe('ok');
    expect(ran).toBe(2);
  });

  it('handles 10 parallel tasks with limit=3', async () => {
    const limit = createLimiter(3);
    let active = 0;
    let maxSeen = 0;

    const tasks = Array.from({ length: 10 }, (_, i) =>
      limit(async () => {
        active++;
        if (active > maxSeen) maxSeen = active;
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return i;
      }),
    );

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(10);
    expect(maxSeen).toBeLessThanOrEqual(3);
  });
});
