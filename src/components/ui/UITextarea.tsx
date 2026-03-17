import type { ComponentProps, FC } from "react";

import { cn } from "./lib/twUtils";

type UITextareaProps = ComponentProps<"textarea">;

export const UITextarea: FC<UITextareaProps> = ({
  className,
  children,
  ...props
}) => {
  return (
    <textarea
      className={cn(
        "border-input bg-background text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 flex min-h-20 w-full rounded-none border px-2.5 py-2 text-xs outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </textarea>
  );
};
