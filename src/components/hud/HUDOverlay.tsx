import type { FC, ReactNode } from "react";

import { cn } from "../ui/lib/twUtils";
import { HUDWrapper } from "./HUDWrapper";

type HUDOverlayProps = {
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export const HUDOverlay: FC<HUDOverlayProps> = ({
  children,
  className,
  contentClassName,
}) => {
  return (
    <HUDWrapper
      className={cn(
        "items-center justify-center bg-black/60 px-4 py-6 md:py-8",
        className
      )}
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-md md:max-w-lg max-h-[90vh] overflow-y-auto",
          contentClassName
        )}
      >
        {children}
      </div>
    </HUDWrapper>
  );
};
