import type { FC, ReactNode } from "react";

import { cn } from "../ui/lib/twUtils";

type HUDWrapperProps = {
  children: ReactNode;
  className?: string;
};

export const HUDWrapper: FC<HUDWrapperProps> = ({ children, className }) => {
  return (
    <div
      className={cn("absolute inset-0 z-(--z-overlay) flex", className)}
      data-game-camera-block
    >
      {children}
    </div>
  );
};
