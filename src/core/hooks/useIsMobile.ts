import { useEffect, useState } from "react";

/**
 * Matches the Tailwind `md` breakpoint (768px). The HUD components use it to
 * switch between the desktop and the mobile layout (bottom-sheet tower shop,
 * top-strip stats, full-width menus).
 */
const MOBILE_QUERY = "(max-width: 767px)";

/**
 * A touch phone in landscape reports a wide viewport (812px on a modern
 * iPhone), so the width query alone flips it to the desktop layout — but the
 * short side is still a phone, where the side-panel layout does not fit.
 * A landscape touch device whose short side is below the breakpoint stays
 * mobile.
 */
const LANDSCAPE_TOUCH_QUERY =
  "(orientation: landscape) and (max-height: 479px) and (pointer: coarse)";

const MOBILE_QUERIES = [MOBILE_QUERY, LANDSCAPE_TOUCH_QUERY];

export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" &&
    MOBILE_QUERIES.some((query) => window.matchMedia(query).matches)
  );

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const queries = MOBILE_QUERIES.map((query) => window.matchMedia(query));
    const onChange = () => setIsMobile(queries.some((item) => item.matches));
    onChange();
    queries.forEach((item) => item.addEventListener("change", onChange));
    return () =>
      queries.forEach((item) => item.removeEventListener("change", onChange));
  }, []);

  return isMobile;
};
