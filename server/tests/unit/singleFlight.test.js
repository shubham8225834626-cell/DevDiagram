import { describe, it, expect, vi } from 'vitest';
import { createSingleFlight } from '../../utils/singleFlight.js';

describe('Single-Flight Request Deduplication', () => {
  it('executes concurrent identical keys only once and resolves all callers with the same value', async () => {
    const sf = createSingleFlight();
    let resolveWork;
    const workFn = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveWork = resolve;
        })
    );

    const p1 = sf.run('facebook/react', workFn);
    const p2 = sf.run('facebook/react', workFn);
    const p3 = sf.run('facebook/react', workFn);

    expect(sf.size()).toBe(1);
    expect(workFn).toHaveBeenCalledTimes(1);

    resolveWork({ nodes: ['a'] });
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toEqual({ nodes: ['a'] });
    expect(r2).toBe(r1);
    expect(r3).toBe(r1);
    expect(sf.size()).toBe(0);
  });

  it('runs distinct keys separately and cleans up after rejection', async () => {
    const sf = createSingleFlight();
    const failFn = vi.fn(async () => {
      throw new Error('transient boom');
    });
    const okFn = vi.fn(async () => 'ok');

    await expect(Promise.all([sf.run('repo-a', failFn), sf.run('repo-a', failFn)])).rejects.toThrow(
      'transient boom'
    );
    expect(failFn).toHaveBeenCalledTimes(1);
    expect(sf.size()).toBe(0);

    // Subsequent run after failure executes fresh
    const res = await sf.run('repo-a', okFn);
    expect(res).toBe('ok');
    expect(okFn).toHaveBeenCalledTimes(1);
  });
});
