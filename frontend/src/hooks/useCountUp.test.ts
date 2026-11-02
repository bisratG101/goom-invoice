import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountUp } from './useCountUp';

describe('useCountUp hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('animates from 0 to target on initial mount', () => {
    const { result } = renderHook(() => useCountUp(1000, 500));

    expect(result.current).toBe(0);

    // Advance halfway through animation
    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThanOrEqual(1000);

    // Advance to completion
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(1000);
  });

  it('animates from previous value when target changes (not restarting from zero)', () => {
    let targetValue = 1000;
    const { result, rerender } = renderHook(() => useCountUp(targetValue, 500));

    // Complete initial animation to 1000
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(result.current).toBe(1000);

    // Update target to 2000
    targetValue = 2000;
    rerender();

    // Value should NOT reset to 0; it should start from 1000
    expect(result.current).toBe(1000);

    act(() => {
      vi.advanceTimersByTime(250);
    });

    // Should be between 1000 and 2000, not between 0 and 2000
    expect(result.current).toBeGreaterThan(1000);
    expect(result.current).toBeLessThanOrEqual(2000);

    // Advance to end
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe(2000);
  });

  it('immediately returns target when prefers-reduced-motion is active', () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const { result } = renderHook(() => useCountUp(5000, 500));

    // Immediately has the target value with no animation delay
    expect(result.current).toBe(5000);
  });

  it('immediately returns target when duration is 0', () => {
    const { result } = renderHook(() => useCountUp(3000, 0));
    expect(result.current).toBe(3000);
  });
});
