import { useEffect } from "react";

// Max parallax offset in px; the tilt utilities scale it down further.
const PARALLAX_MAX_OFFSET_PX = 10;

// Drives the mouse parallax of the tilted menu panels. One pointermove
// listener on the document root writes --ui-menu-parallax-x/-y
// (unitless, clamped to -MAX..MAX around the viewport center); the
// ui-menu-tilt-* utilities feed those into a small rotation and shift,
// and their transform transition eases the panels into place. With
// prefers-reduced-motion enabled the panels keep their static tilt and
// do not follow the cursor.
export const useMenuParallax = () => {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

    const clearVariables = () => {
      root.style.removeProperty("--ui-menu-parallax-x");
      root.style.removeProperty("--ui-menu-parallax-y");
    };

    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return;

      const x = Math.max(
        -1,
        Math.min(1, (event.clientX / window.innerWidth) * 2 - 1)
      );
      const y = Math.max(
        -1,
        Math.min(1, (event.clientY / window.innerHeight) * 2 - 1)
      );
      root.style.setProperty(
        "--ui-menu-parallax-x",
        `${PARALLAX_MAX_OFFSET_PX * x}`
      );
      root.style.setProperty(
        "--ui-menu-parallax-y",
        `${PARALLAX_MAX_OFFSET_PX * y * 0.6}`
      );
    };

    // A runtime toggle of the OS setting must also stop the parallax
    // instead of leaving the last offset frozen on the panels.
    const onReducedMotionChange = (event: MediaQueryListEvent) => {
      if (event.matches) clearVariables();
    };

    root.addEventListener("pointermove", onPointerMove);
    reducedMotion.addEventListener("change", onReducedMotionChange);
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      reducedMotion.removeEventListener("change", onReducedMotionChange);
      clearVariables();
    };
  }, []);
};
