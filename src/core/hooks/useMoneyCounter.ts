import { useEffect, useRef, useState } from "react";

/**
 * Tween duration: ~250ms, matching the request. Short enough to feel instant,
 * long enough that a big swing (a wave of kills) visibly rolls up instead of
 * snapping.
 */
export const MONEY_TWEEN_DURATION_MS = 250;

const prefersReducedMotion = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;

/**
 * Eases an integer (the money counter) toward `target` over
 * `MONEY_TWEEN_DURATION_MS` with an ease-out curve. Pure DOM work: one rAF
 * loop mutating a local state value, no 3D cost.
 *
 * - Interrupted mid-flight, a new target retargets from the value currently
 *   on screen, so rapid gains (several kills in a row) blend instead of
 *   jumping.
 * - Tiny deltas (a few coins) take the fast path: they arrive in a single
 *   step instead of spending a full 250ms tween on ~3 units.
 * - Under `prefers-reduced-motion` the value snaps instantly.
 */
export const useMoneyCounter = (target: number): number => {
  const [displayed, setDisplayed] = useState(target);
  const displayedRef = useRef(target);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = displayedRef.current;
    const to = target;
    if (from === to) return;

    if (prefersReducedMotion()) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      displayedRef.current = to;
      setDisplayed(to);
      return;
    }

    // Fast path: a delta smaller than this renders in one frame's step
    // anyway, so tweening it would just stretch nothing.
    if (Math.abs(to - from) < 4) {
      displayedRef.current = to;
      setDisplayed(to);
      return;
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / MONEY_TWEEN_DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      displayedRef.current = value;
      setDisplayed(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = 0;
        displayedRef.current = to;
        setDisplayed(to);
      }
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  return displayed;
};
