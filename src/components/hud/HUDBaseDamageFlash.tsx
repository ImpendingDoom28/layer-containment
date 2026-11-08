import { FC, useEffect, useRef } from "react";

import { useBaseHealth } from "../../core/hooks/useBaseHealth";
import { useGameStore } from "../../core/stores/useGameStore";

// The base-damage punch is paired with a red tint: a screen-edge vignette
// that spikes briefly and decays over ~0.5s (the camera kicks at the same
// time). The flash is driven by rAF mutations on a persistent element (no
// React state per hit), the same pattern as the in-scene hit flash.
const FLASH_MAX_OPACITY = 0.38;
const FLASH_DECAY_LAMBDA = 4;

/**
 * Shows the red-tinted damage flash whenever the base's health drops (an
 * enemy reached the end of a path). Mount once in the in-game HUD; it
 * self-gates on `gameStatus === "playing"` and on health actually dropping,
 * so run resets and full-heal transitions never flash. Skipped under
 * `prefers-reduced-motion`.
 */
export const HUDBaseDamageFlash: FC = () => {
  const gameStatus = useGameStore((state) => state.gameStatus);
  const baseHealth = useBaseHealth();
  const elementRef = useRef<HTMLDivElement | null>(null);
  const flashLevelRef = useRef(0);
  const rafRef = useRef(0);
  const lastHealthRef = useRef(0);

  useEffect(() => {
    if (baseHealth < lastHealthRef.current && gameStatus === "playing") {
      // A drop: spike the flash (a higher hit doesn't change the flash — it
      // is a per-tick acknowledgment, not damage-scaled).
      lastHealthRef.current = baseHealth;
      if (
        window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ===
        true
      ) {
        return;
      }
      flashLevelRef.current = 1;
      const element = elementRef.current;
      if (element) {
        element.style.opacity = String(FLASH_MAX_OPACITY);
      }
      if (!rafRef.current) {
        let previous = performance.now();
        const tick = (now: number) => {
          const delta = Math.min((now - previous) / 1000, 0.25);
          previous = now;
          const level = flashLevelRef.current;
          if (level <= 0.002) {
            flashLevelRef.current = 0;
            if (elementRef.current) {
              elementRef.current.style.opacity = "0";
            }
            rafRef.current = 0;
            return;
          }
          const reduced =
            window.matchMedia?.("(prefers-reduced-motion: reduce)")
              ?.matches === true;
          const next = reduced
            ? 0
            : level * Math.exp(-FLASH_DECAY_LAMBDA * delta);
          flashLevelRef.current = next;
          if (elementRef.current) {
            elementRef.current.style.opacity = String(next * FLASH_MAX_OPACITY);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      }
    } else {
      // No drop (run reset, heal, or first mount): re-baseline without
      // flashing.
      lastHealthRef.current = baseHealth;
    }
  }, [baseHealth, gameStatus]);

  useEffect(
    () => () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    },
    []
  );

  return (
    <div
      ref={elementRef}
      data-testid="base-damage-flash"
      className="base-damage-flash pointer-events-none absolute inset-0"
      style={{ opacity: 0 }}
    />
  );
};

HUDBaseDamageFlash.displayName = "HUDBaseDamageFlash";
