import { ChevronLeft, ChevronRight } from "lucide-react";

import { UIButton } from "./buttons/UIButton";
import { formControlVariants } from "./lib/uiForm";
import { cn } from "./lib/twUtils";
import { UITypography } from "./UITypography";

export type UICarouselSelectOption<T extends string> = {
  value: T;
  label: string;
};

type UICarouselSelectProps<T extends string> = {
  options: readonly UICarouselSelectOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  /** Accessible name for the control (aria-label). */
  label: string;
  className?: string;
};

/**
 * Carousel-style selector: the current value with prev/next arrows. The value
 * is read directly (no local copy), so external resets of the controlled
 * value are always reflected. Arrows wrap around the options list.
 */
export const UICarouselSelect = <T extends string>({
  options,
  value,
  onSelect,
  label,
  className,
}: UICarouselSelectProps<T>) => {
  const index = Math.max(
    options.findIndex((option) => option.value === value),
    0
  );
  const step = (direction: 1 | -1) => {
    const next = (index + direction + options.length) % options.length;
    onSelect(options[next].value);
  };

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(formControlVariants({ control: "input" }), className)}
    >
      <UIButton
        variant="ghost"
        size="icon-xs"
        aria-label={`${label} (previous)`}
        onClick={() => step(-1)}
        className="shrink-0 rounded-none border-0"
      >
        <ChevronLeft />
      </UIButton>
      <UITypography
        variant="small"
        whiteSpace="nowrap"
        className="min-w-0 flex-1 overflow-hidden text-center"
      >
        {options[index].label}
      </UITypography>
      <UIButton
        variant="ghost"
        size="icon-xs"
        aria-label={`${label} (next)`}
        onClick={() => step(1)}
        className="shrink-0 rounded-none border-0"
      >
        <ChevronRight />
      </UIButton>
    </div>
  );
};
