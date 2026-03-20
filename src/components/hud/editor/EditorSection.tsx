import type { ReactNode } from "react";

import { cn } from "../../ui/lib/twUtils";

type EditorSectionProps = {
  children: ReactNode;
  className?: string;
};

export const EditorSection = ({ children, className }: EditorSectionProps) => {
  return (
    <div className={cn("border p-3", className)}>{children}</div>
  );
};
