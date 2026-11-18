import * as React from "react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { Icon } from "./Icon";
import { cn } from "./lib/twUtils";

type UICheckboxProps = React.ComponentProps<
  typeof CheckboxPrimitive.Root
> & {
  /**
   * Display-only "failed" state: a red X instead of the check indicator. Not
   * part of Radix's controlled state, so `checked` is ignored while it is set.
   */
  failed?: boolean;
};

function UICheckbox({ className, failed = false, ...props }: UICheckboxProps) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground flex size-4 shrink-0 items-center justify-center rounded-none border outline-none focus-visible:ring-1 disabled:cursor-not-allowed disabled:opacity-50",
        // A failed box conveys a state rather than a disabled control, so it
        // stays fully opaque (and the red X reads) even when disabled.
        failed && "border-destructive text-destructive disabled:opacity-100",
        className
      )}
      {...props}
      // Radix only emits checked/unchecked/indeterminate; the failed state is
      // overridden after its own data-state so the indicator can be forced on.
      // Spread conditionally (not `data-state={undefined}`) so a non-failed
      // box keeps Radix's generated state and its checked styling.
      {...(failed ? { "data-state": "failed" } : {})}
    >
      <CheckboxPrimitive.Indicator forceMount={failed || undefined}>
        <Icon
          name={failed ? "X" : "Check"}
          color={failed ? "destructive" : undefined}
          size={12}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { UICheckbox };
