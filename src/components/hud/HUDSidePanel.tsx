import type { FC, ReactNode } from "react";

import { cn } from "../ui/lib/twUtils";
import { HUDWrapper } from "./HUDWrapper";

type HUDSidePanelProps = {
  children: ReactNode;
  className?: string;
  side?: "left" | "right";
};

export const HUDSidePanel: FC<HUDSidePanelProps> = ({
  children,
  className,
  side = "right",
}) => {
  return (
    <HUDWrapper className={cn("px-4 py-4 md:py-6", className)}>
      <div
        className={cn(
          "pointer-events-none relative z-10 flex h-full w-full",
          side === "right" ? "justify-end" : "justify-start"
        )}
      >
        <div className="flex w-full h-full max-w-md pointer-events-auto md:max-w-lg">
          {children}
        </div>
      </div>
    </HUDWrapper>
  );
};
