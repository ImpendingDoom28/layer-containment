import type { ComponentProps, FC, MouseEvent } from "react";

import { type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

import { buttonVariants } from "./lib/buttonVariants";
import { cn } from "../lib/twUtils";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import { TowerType } from "../../../core/types/game";

export type UIButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    deniedData?: {
      reason: "insufficient_funds";
      towerType: TowerType;
    };
  };

export const UIButton: FC<UIButtonProps> = ({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  onClick,
  disabled = false,
  deniedData,
  ...props
}) => {
  const Comp = asChild ? Slot : "button";

  const onButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (disabled) {
      gameEvents.emit(GameEvent.UI_ACTION_DENIED, deniedData);
    } else {
      onClick?.(event);
      gameEvents.emit(GameEvent.UI_CLICK);
    }
  };

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      aria-disabled={disabled}
      className={cn(
        buttonVariants({ variant, size, className }),
        disabled && "cursor-not-allowed opacity-50"
      )}
      onClick={onButtonClick}
      {...props}
    />
  );
};
