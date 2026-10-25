import { FC, type HTMLAttributes, type ReactNode } from "react";

import { cn } from "../ui/lib/twUtils";

type HUDWrapperProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const HUDWrapper: FC<HUDWrapperProps> = ({
  children,
  className,
  ...props
}) => {
  return (
    <div
      className={cn("absolute inset-0 z-(--z-overlay) flex", className)}
      data-game-camera-block
      {...props}
    >
      {children}
    </div>
  );
};
