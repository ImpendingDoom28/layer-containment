import { useEffect } from "react";

// Max parallax offset in px; the tilt utilities scale it down further.
const PARALLAX_MAX_OFFSET_PX = 10;

// Drives the mouse parallax of the tilted menu panels. One pointermove
// listener on the document root writes --ui-menu-parallax-x/-y
// (unitless, clamped to -MAX..MAX around the viewport center); the
// ui-menu-tilt-* utilities feed those into a small rotation and shift,
// and their transform transition eases the panels into place.
export const useMenuParallax = () => {
  useEffect(() => {
    const root = document.documentElement;

    const onPointerMove = (event: PointerEvent) => {
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

    root.addEventListener("pointermove", onPointerMove);
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      root.style.removeProperty("--ui-menu-parallax-x");
      root.style.removeProperty("--ui-menu-parallax-y");
    };
  }, []);
};
