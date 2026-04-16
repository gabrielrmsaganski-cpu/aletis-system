import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook that animates a number from 0 to a target value over a given
 * duration using `requestAnimationFrame`. The easing function produces a
 * smooth ease-out curve so the animation decelerates naturally.
 *
 * @param target  — The final numeric value to animate towards.
 * @param duration — Animation duration in milliseconds (default 1500).
 * @returns The current animated value (number).
 */
export function useAnimatedNumber(target: number, duration: number = 1500): number {
  const [current, setCurrent] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const previousTargetRef = useRef<number>(0);

  useEffect(() => {
    // Capture the starting value so we can animate from wherever we are now
    const startValue = previousTargetRef.current;
    const delta = target - startValue;

    // If there is nothing to animate, set immediately
    if (delta === 0) {
      setCurrent(target);
      return;
    }

    // Cancel any running animation
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }

    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease-out cubic: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);

      const value = startValue + delta * eased;
      setCurrent(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        // Ensure we land exactly on target
        setCurrent(target);
        previousTargetRef.current = target;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, duration]);

  // Update the "previous" ref when target changes so subsequent animations
  // pick up from the correct starting point even if interrupted.
  useEffect(() => {
    return () => {
      previousTargetRef.current = current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return current;
}

export default useAnimatedNumber;
