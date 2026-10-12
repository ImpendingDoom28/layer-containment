import {
  useEffect,
  useMemo,
  useRef,
  type AnimationEvent,
  type CSSProperties,
  type FC,
  type ReactNode,
} from "react";

import { cn } from "../ui/lib/twUtils";
import { HUDWrapper } from "./HUDWrapper";
import {
  UI_PANEL_SLIDE_IN_DELAY_MS,
  UI_PANEL_SLIDE_IN_DURATION_MS,
  UI_PANEL_SLIDE_IN_EASING,
  UI_PANEL_SLIDE_OUT_ANIMATION_NAME,
  UI_PANEL_SLIDE_OUT_DELAY_MS,
  UI_PANEL_SLIDE_OUT_DURATION_MS,
  UI_PANEL_SLIDE_OUT_EASING,
} from "../../constants/uiPanelAnimation";

type HUDSidePanelProps = {
  children: ReactNode;
  className?: string;
  side?: "left" | "right";
  closing?: boolean;
  onExited?: () => void;
  menuRef?: React.RefObject<HTMLDivElement | null>;
};

export const HUDSidePanel: FC<HUDSidePanelProps> = ({
  children,
  className,
  side = "right",
  closing = false,
  onExited,
  menuRef,
}) => {
  const onExitedRef = useRef(onExited);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const handleAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (
      event.target === event.currentTarget &&
      event.animationName === UI_PANEL_SLIDE_OUT_ANIMATION_NAME
    ) {
      onExitedRef.current?.();
    }
  };

  const style = useMemo(
    () =>
      ({
        "--ui-panel-slide-delay": `${
          closing ? UI_PANEL_SLIDE_OUT_DELAY_MS : UI_PANEL_SLIDE_IN_DELAY_MS
        }ms`,
        "--ui-panel-slide-duration": `${
          closing
            ? UI_PANEL_SLIDE_OUT_DURATION_MS
            : UI_PANEL_SLIDE_IN_DURATION_MS
        }ms`,
        "--ui-panel-slide-easing": closing
          ? UI_PANEL_SLIDE_OUT_EASING
          : UI_PANEL_SLIDE_IN_EASING,
      }) as CSSProperties,
    [closing]
  );

  return (
    <HUDWrapper className={cn(className)}>
      <div
        ref={menuRef}
        className={cn(
          "pointer-events-none relative z-10 flex h-full w-full",
          side === "right" ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            "flex w-full pointer-events-auto md:max-w-xl",
            closing ? "ui-panel-slide-out" : "ui-panel-slide-in",
            closing && "pointer-events-none",
            side === "left" && "ui-panel-slide-left",
            side === "right" && "ui-panel-slide-right"
          )}
          style={style}
          onAnimationEnd={handleAnimationEnd}
        >
          <div
            className={cn(
              "ui-menu-tilt flex min-h-0 w-full",
              side === "left"
                ? "ui-menu-tilt-left ui-menu-tilt-shadow-left"
                : "ui-menu-tilt-right ui-menu-tilt-shadow-right"
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </HUDWrapper>
  );
};
