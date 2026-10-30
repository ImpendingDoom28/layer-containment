import { useEffect, type FC, type ReactNode } from "react";

import { Dialog as DialogPrimitive } from "radix-ui";

import { getCameraMovesForEvent } from "../../core/keybindings";
import {
  keybindingsSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";
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
   * ARIA role of the dialog content. Defaults to "dialog"; use
   * "alertdialog" for modals that interrupt the flow and demand a decision
   * (e.g. confirm dialogs).
   */
  role?: "dialog" | "alertdialog";
  /**
   * Body content shown under the title.
   */
  children: ReactNode;
  /**
   * Footer content (typically action buttons).
   */
  footer?: ReactNode;
  /**
   * Whether clicking the backdrop dismisses the modal. Defaults to true.
   * Set to false for modals the player must explicitly acknowledge
   * (e.g. the first-run controls intro).
   */
  dismissible?: boolean;
  /**
   * Called when the open state changes, including dismissals
   * (backdrop click when dismissible, or the Escape key).
   */
  onOpenChange?: (open: boolean) => void;
};

/**
 * A shared centered modal dialog.
 *
 * Renders a card on top of a dimmed backdrop with an optional icon, a title,
 * body content, and an optional footer (typically action buttons).
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
  role = "dialog",
  dismissible = true,
  children,
  footer,
  onOpenChange,
}) => {
  const keybindings = useSettingsStore(keybindingsSelector);

  // Radix only swallows the Escape keydown; camera-control keys (WASD /
  // arrows) would otherwise bubble to the game's window listener and move the
  // camera while the modal is open. Block them in the capture phase, on
  // document, the same way Radix does — the dialog content is portaled outside
  // the React root, so a React onKeyDown on it would never fire for these.
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (getCameraMovesForEvent(keybindings, e, "down").length > 0) {
        e.stopPropagation();
      }
    };

    document.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      document.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [open, keybindings]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) return;
    onOpenChange?.(false);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        {/* The overlay and the card both block game camera control (same
            mechanism as the game menus), so an open modal cannot be used to
            drag the camera behind it. */}
        <DialogPrimitive.Overlay
          data-game-camera-block
          className="fixed inset-0 z-(--z-modal) bg-black/60"
        />
        <DialogPrimitive.Content
          data-game-camera-block
          role={role}
          // Keep the Escape keydown from bubbling to window listeners (e.g.
          // the game's keyboard system), so dismissing a modal does not also
          // toggle the game menu.
          onEscapeKeyDown={(e) => e.stopPropagation()}
          onInteractOutside={(e) => {
            if (!dismissible) e.preventDefault();
          }}
          className="fixed left-1/2 top-1/2 z-(--z-modal) -translate-x-1/2 -translate-y-1/2 w-[min(100%-2rem,28rem)] outline-none"
        >
          <UICard
            className={cn(
              "mx-auto w-full max-w-sm animate-in fade-in zoom-in-95 duration-150",
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
            <DialogPrimitive.Description asChild>
              <UICardContent>{children}</UICardContent>
            </DialogPrimitive.Description>
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
