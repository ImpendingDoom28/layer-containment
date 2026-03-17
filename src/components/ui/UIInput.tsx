import type { ComponentProps, FC } from "react";

import { cn } from "./lib/twUtils";

type UIInputProps = ComponentProps<"input">;

export const UIInput: FC<UIInputProps> = ({ className, ...props }) => {
  return (
    <input
      className={cn(
        "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex h-8 w-full rounded-none border px-2.5 text-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
};
