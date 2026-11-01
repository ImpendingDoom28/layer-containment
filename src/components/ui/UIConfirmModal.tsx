import type { FC, ReactNode } from "react";

import { Icon } from "./Icon";
import { UIButton } from "./buttons/UIButton";
import { UIModal } from "./UIModal";

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
 * A shared confirm dialog built on top of the common modal.
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
  return (
    <UIModal
      open={open}
      title={title}
      icon={<Icon name="AlertTriangle" color="destructive" size={16} />}
      className={className}
      role="alertdialog"
      footer={
        <>
          <UIButton variant="ghost" onClick={() => onOpenChange?.(false)}>
            {cancelLabel}
          </UIButton>
          <UIButton variant="destructive" onClick={onConfirm}>
            {confirmLabel}
          </UIButton>
        </>
      }
      onOpenChange={onOpenChange}
    >
      {message}
    </UIModal>
  );
};
