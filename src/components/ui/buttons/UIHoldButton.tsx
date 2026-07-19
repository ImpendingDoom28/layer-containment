import {
  type ComponentProps,
  type FC,
  type ReactNode,
} from "react";

import { type VariantProps } from "class-variance-authority";

import {
  buttonVariants,
  holdButtonFillVariants,
} from "./lib/buttonVariants";
import { useHoldButton } from "./lib/useHoldButton";
import { cn } from "../lib/twUtils";
import { TowerType } from "../../../core/types/game";

const UI_HOLD_BUTTON_DEFAULT_DURATION_MS = 1200;
const UI_HOLD_BUTTON_FILL_RESET_TRANSITION_MS = 200;

export type UIHoldButtonProps = Omit<ComponentProps<"button">, "onClick"> &
  VariantProps<typeof buttonVariants> & {
    duration?: number;
    label?: ReactNode;
    holdingLabel?: ReactNode;
    onConfirm: () => void;
    onAbort?: (progress: number) => void;
    deniedData?: {
      reason: "insufficient_funds";
      towerType: TowerType;
    };
  };

export const UIHoldButton: FC<UIHoldButtonProps> = ({
  className,
  variant = "default",
  size = "default",
  duration,
  label,
  holdingLabel,
  onConfirm,
  onAbort,
  disabled = false,
  deniedData,
  children,
  ...props
}) => {
  const {
    state,
    progress,
    isAnimatingReset,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
    onKeyDown,
    onKeyUp,
  } = useHoldButton({
    duration: duration ?? UI_HOLD_BUTTON_DEFAULT_DURATION_MS,
    fillResetTransitionMs: UI_HOLD_BUTTON_FILL_RESET_TRANSITION_MS,
    disabled,
    deniedData,
    onConfirm,
    onAbort,
  });

  const idleLabel = label ?? children;
  const hasHoldingLabel = holdingLabel !== undefined;
  const isShowingHoldingLabel = state === "holding" && hasHoldingLabel;

  return (
    <button
      type="button"
      data-slot="hold-button"
      data-variant={variant}
      data-size={size}
      data-state={state}
      aria-disabled={disabled}
      aria-live="polite"
      className={cn(
        buttonVariants({ variant, size }),
        "relative overflow-hidden",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      {...props}
    >
      <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <span
          className={cn(
            holdButtonFillVariants({ variant }),
            isAnimatingReset && "transition-[width]"
          )}
          style={{
            width: `${progress * 100}%`,
            transitionDuration: isAnimatingReset
              ? `${UI_HOLD_BUTTON_FILL_RESET_TRANSITION_MS}ms`
              : undefined,
          }}
        />
      </span>
      <span className="relative z-10 inline-flex items-center justify-center gap-1.5">
        {hasHoldingLabel ? (
          <span className="inline-grid [&>*]:col-start-1 [&>*]:row-start-1">
            <span
              aria-hidden={isShowingHoldingLabel}
              className={cn(
                "inline-flex items-center justify-center gap-1.5",
                isShowingHoldingLabel && "invisible"
              )}
            >
              {idleLabel}
            </span>
            <span
              aria-hidden={!isShowingHoldingLabel}
              className={cn(
                "inline-flex items-center justify-center gap-1.5",
                !isShowingHoldingLabel && "invisible"
              )}
            >
              {holdingLabel}
            </span>
          </span>
        ) : (
          idleLabel
        )}
      </span>
    </button>
  );
};
