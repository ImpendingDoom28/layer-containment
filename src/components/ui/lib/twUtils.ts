import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * `translateX` percentages use the transformed element’s width, not the viewport.
 * Maps a viewport-width share (same numeric sense as vw: `-50` ≈ `-50vw`) to the
 * equivalent `translateX` percentage for an element whose reference width is
 * `translateReferenceWidthPx`.
 */
export const twTranslateXPercentFromViewportWidth = (
  viewportWidthPx: number,
  translateReferenceWidthPx: number,
  viewportWidthShare: number,
): string => {
  if (viewportWidthPx <= 0 || translateReferenceWidthPx <= 0) {
    return "0%";
  }
  const percent =
    (viewportWidthShare * viewportWidthPx) / translateReferenceWidthPx;
  return `${percent}%`;
};
