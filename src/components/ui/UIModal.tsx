import type { FC, ReactNode } from "react";

import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "./lib/twUtils";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
  UICardTitle,
} from "./UICard";
import { UITypography } from "./UITypography";

export type UIModalProps = {
  /**
   * Whether the modal is open.
   */
  open: boolean;
  /**
   * Title shown in the modal header.
   */
  title: ReactNode;
  /**
   * Icon rendered before the title.
   */
  icon?: ReactNode;
  /**
   * Optional class name applied to the modal card.
   */
  className?: string;
  /**
   * Body content shown under the title.
   */
  children: ReactNode;
  /**
   * Footer content (typically action buttons).
   */
  footer?: ReactNode;
  /**
   * Called when the open state changes, including dismissals
   * (backdrop click or Escape key).
   */
  onOpenChange?: (open: boolean) => void;
};

/**
 * A shared centered modal dialog.
 *
 * Renders a card on top of a dimmed backdrop with an optional icon, a title,
 * body content, and an optional footer (typically action buttons). Escape or
 * a backdrop click dismiss the modal through `onOpenChange` — components that
 * must not be dismissed that way (e.g. confirm dialogs) pass a handler that
 * ignores the event.
 *
 * @example
 *  <UIModal
 *    open={open}
 *    title="Controls"
 *    icon={<Keyboard className="size-4" />}
 *    footer={<UIButton onClick={() => setOpen(false)}>Got it</UIButton>}
 *    onOpenChange={setOpen}
 *  >
 *    ...
 *  </UIModal>
 */
export const UIModal: FC<UIModalProps> = ({
  open,
  title,
  icon,
  className,
  children,
  footer,
  onOpenChange,
}) => {
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    onOpenChange?.(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-(--z-modal) bg-black/60" />
        <DialogPrimitive.Content
          onEscapeKeyDown={(e) => e.stopPropagation()}
          className="fixed left-1/2 top-1/2 z-(--z-modal) -translate-x-1/2 -translate-y-1/2 w-[min(100%-2rem,20rem)] outline-none"
        >
          <UICard
            className={cn(
              "w-full max-w-sm animate-in fade-in zoom-in-95 duration-150",
              className
            )}
          >
            <UICardHeader>
              <UICardTitle className="gap-x-2">
                {icon}
                <DialogPrimitive.Title>
                  <UITypography variant="h4" className="text-base">
                    {title}
                  </UITypography>
                </DialogPrimitive.Title>
              </UICardTitle>
            </UICardHeader>
            <UICardContent>{children}</UICardContent>
            {footer !== undefined && (
              <UICardFooter className="justify-end gap-6">
                {footer}
              </UICardFooter>
            )}
          </UICard>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
