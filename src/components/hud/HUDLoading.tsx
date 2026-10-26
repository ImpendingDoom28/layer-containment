import {
  FC,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  type AnimationEvent,
  type CSSProperties,
} from "react";
import { useTranslation } from "react-i18next";

import { useReducedMotion } from "../../core/hooks/useReducedMotion";
import { cn } from "../ui/lib/twUtils";
import { UITypography } from "../ui/UITypography";
import { HUDWrapper } from "./HUDWrapper";
import {
  UI_LOADING_BAR_DURATION_MS,
  UI_LOADING_SLIDE_IN_DURATION_MS,
  UI_LOADING_SLIDE_OUT_ANIMATION_NAME,
  UI_LOADING_SLIDE_OUT_DURATION_MS,
} from "../../constants/uiLoadingAnimation";

type HUDLoadingProps = {
  message?: string;
  className?: string;
  /**
   * Plays the slide-out animation. The caller keeps the overlay mounted
   * while closing and unmounts it once `onExited` fires, so the text
   * animates away instead of vanishing.
   */
  closing?: boolean;
  onExited?: () => void;
};

export const HUDLoading: FC<HUDLoadingProps> = ({
  message,
  className,
  closing = false,
  onExited,
}) => {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  const onExitedRef = useRef(onExited);
  const hasExitedRef = useRef(false);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const notifyExited = useCallback(() => {
    // The exit animation ending (and the reduced-motion path below) can both
    // report the exit; only the first one counts.
    if (hasExitedRef.current) return;
    hasExitedRef.current = true;
    onExitedRef.current?.();
  }, []);

  // Reduced motion collapses the exit animation to 0ms, so a browser can
  // finish it before `animationend` is delivered — report the exit directly.
  // Otherwise wait for the animation, but never longer than a buffered
  // timeout: if `animationend` never arrives (busy compositor, tab
  // throttling, interrupted frame), the overlay must still go away.
  useEffect(() => {
    if (!closing) return;
    if (reducedMotion) {
      notifyExited();
      return;
    }
    const timeoutId = setTimeout(
      notifyExited,
      UI_LOADING_SLIDE_OUT_DURATION_MS + 250
    );
    return () => clearTimeout(timeoutId);
  }, [closing, reducedMotion, notifyExited]);

  const handleAnimationEnd = useCallback(
    (event: AnimationEvent<HTMLDivElement>) => {
      if (
        !closing ||
        event.target !== event.currentTarget ||
        event.animationName !== UI_LOADING_SLIDE_OUT_ANIMATION_NAME
      ) {
        return;
      }
      notifyExited();
    },
    [closing, notifyExited]
  );

  const style = useMemo(
    () =>
      ({
        "--ui-loading-slide-in-duration": `${
          reducedMotion ? 0 : UI_LOADING_SLIDE_IN_DURATION_MS
        }ms`,
        "--ui-loading-slide-out-duration": `${
          reducedMotion ? 0 : UI_LOADING_SLIDE_OUT_DURATION_MS
        }ms`,
        "--ui-loading-bar-duration": `${UI_LOADING_BAR_DURATION_MS}ms`,
      }) as CSSProperties,
    [reducedMotion]
  );

  return (
    <HUDWrapper
      className={cn(
        "items-end justify-end bg-black",
        // While sliding out the overlay must not keep swallowing clicks
        // even if it lingers for a moment.
        closing && "pointer-events-none",
        className
      )}
      aria-busy="true"
      data-testid="hud-loading"
    >
      <div
        className={cn(
          "flex flex-col items-end gap-2 p-4 sm:p-8",
          closing ? "ui-loading-slide-out" : "ui-loading-slide-in"
        )}
        style={style}
        onAnimationEnd={handleAnimationEnd}
      >
        <UITypography variant="body" className="text-muted-foreground">
          {message ?? t("common.loading")}
        </UITypography>
        <div className="ui-loading-bar h-0.5 w-40 text-primary" aria-hidden />
      </div>
    </HUDWrapper>
  );
};
