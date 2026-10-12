import type { FC, ReactNode } from "react";

import { Dialog as DialogPrimitive } from "radix-ui";
import { AlertTriangle } from "lucide-react";

import { cn } from "./lib/twUtils";
import { UIButton } from "./buttons/UIButton";
import { UITypography } from "./UITypography";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
  UICardTitle,
} from "./UICard";

export type UIConfirmModalProps = {
  /**
   * Whether the confirm modal is open.
   */
  open: boolean;
  /**
   * Title shown in the modal header.
   */
  title: string;
  /**
   * Body text shown under the title.
   */
  message: ReactNode;
  /**
   * Label for the confirm button. Defaults to "Confirm".
   */
  confirmLabel?: string;
  /**
   * Label for the cancel button. Defaults to "Cancel".
   */
  cancelLabel?: string;
  /**
   * Optional class name applied to the modal card.
   */
  className?: string;
  /**
   * Called when the user confirms the action.
   */
  onConfirm: () => void;
  /**
   * Called when the open state changes, including dismissals
   * (cancel button, backdrop click, or Escape key).
   */
  onOpenChange?: (open: boolean) => void;
};

/**
 * A shared confirm dialog.
 *
 * Renders a centered card on top of a dimmed backdrop with a title,
 * a message, and two buttons: a confirm action and a cancel action.
 * Escape, backdrop click, or the cancel button dismiss the modal
 * through `onOpenChange`.
 *
 * @example
 *  <UIConfirmModal
 *    open={open}
 *    title="Exit game"
 *    message="Are you sure you want to exit?"
 *    confirmLabel="Exit"
 *    cancelLabel="Ok"
 *    onConfirm={handleConfirm}
 *    onOpenChange={setOpen}
 *  />
 */
export const UIConfirmModal: FC<UIConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  className,
  onConfirm,
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
          role="alertdialog"
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
                <AlertTriangle className="size-4 text-destructive" />
                <DialogPrimitive.Title>
                  <UITypography variant="h4" className="text-base">
                    {title}
                  </UITypography>
                </DialogPrimitive.Title>
              </UICardTitle>
            </UICardHeader>
            <UICardContent>
              <DialogPrimitive.Description>
                <UITypography
                  variant="small"
                  className="leading-relaxed text-muted-foreground"
                >
                  {message}
                </UITypography>
              </DialogPrimitive.Description>
            </UICardContent>
            <UICardFooter className="justify-end gap-6">
              <DialogPrimitive.Close asChild>
                <UIButton variant="ghost">{cancelLabel}</UIButton>
              </DialogPrimitive.Close>
              <UIButton variant="destructive" onClick={onConfirm}>
                {confirmLabel}
              </UIButton>
            </UICardFooter>
          </UICard>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
