import { describe, it, expect, vi, afterEach } from 'vitest';
import { createTimeoutController } from './timeout-utils';

describe('createTimeoutController', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an AbortController with default 30s timeout', () => {
    vi.useFakeTimers();
    const { controller, clearTimeout: clear } = createTimeoutController();

    expect(controller).toBeInstanceOf(AbortController);
    expect(controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(30000);
    expect(controller.signal.aborted).toBe(true);

    clear();
    vi.useRealTimers();
  });

  it('creates an AbortController with custom timeout', () => {
    vi.useFakeTimers();
    const { controller, clearTimeout: clear } = createTimeoutController(5000);

    expect(controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(4999);
    expect(controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1);
    expect(controller.signal.aborted).toBe(true);

    clear();
    vi.useRealTimers();
  });

  it('clearTimeout prevents abort', () => {
    vi.useFakeTimers();
    const { controller, clearTimeout: clear } = createTimeoutController(5000);

    clear();
    vi.advanceTimersByTime(10000);
    expect(controller.signal.aborted).toBe(false);

    vi.useRealTimers();
  });

  it('returns a timeoutId', () => {
    vi.useFakeTimers();
    const { timeoutId, clearTimeout: clear } = createTimeoutController();

    expect(timeoutId).toBeDefined();

    clear();
    vi.useRealTimers();
  });
});
