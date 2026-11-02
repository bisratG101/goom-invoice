import { useState, useEffect, useRef } from 'react';

/**
 * Hook to animate count-up numbers under 600ms per design.md §12.7 and §12.10.
 * Automatically respects prefers-reduced-motion (instant display).
 * When target value changes after initial loading, animates smoothly from the previous
 * displayed value rather than restarting from zero.
 */
export function useCountUp(target: number, durationMs = 500): number {
  const isReducedMotion = (): boolean => {
    if (typeof window === 'undefined') return true;
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)')?.matches === true;
    }
    return false;
  };

  const currentRef = useRef<number>(0);
  const [current, setCurrent] = useState<number>(() => {
    if (isReducedMotion() || durationMs <= 0) {
      currentRef.current = target;
      return target;
    }
    currentRef.current = 0;
    return 0;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || isReducedMotion() || durationMs <= 0) {
      currentRef.current = target;
      setCurrent(target);
      return;
    }

    const startValue = currentRef.current;
    if (startValue === target) {
      setCurrent(target);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;
    const changeInValue = target - startValue;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const elapsed = timestamp - startTimestamp;
      const progress = Math.min(elapsed / durationMs, 1);

      // Ease-out cubic formula per design.md §12.2 (--ease)
      const easeOutProgress = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(startValue + changeInValue * easeOutProgress);

      currentRef.current = nextValue;
      setCurrent(nextValue);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        currentRef.current = target;
        setCurrent(target);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [target, durationMs]);

  return current;
}
