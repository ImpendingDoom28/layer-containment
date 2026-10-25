import { useEffect, useState } from "react";

/**
 * Matches the Tailwind `md` breakpoint (768px). The HUD components use it to
 * switch between the desktop and the mobile layout (bottom-sheet tower shop,
 * top-strip stats, full-width menus).
 */
const MOBILE_QUERY = "(max-width: 767px)";

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.(MOBILE_QUERY)?.matches === true
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia(MOBILE_QUERY);
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    onChange({ matches: query.matches } as MediaQueryListEvent);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return isMobile;
};
