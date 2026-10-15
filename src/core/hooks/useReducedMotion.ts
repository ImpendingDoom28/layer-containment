import { useEffect, useState } from "react";

/**
 * Tracks the user's `prefers-reduced-motion` setting, updating live if it
 * changes while the app is open.
 */
export const useReducedMotion = (): boolean => {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
};
