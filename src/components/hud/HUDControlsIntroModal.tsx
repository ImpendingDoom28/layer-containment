import type { FC } from "react";

import { Keyboard } from "lucide-react";

import { formatKeyCode } from "../../core/keybindings";
import {
  keybindingsSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";
import { UIButton } from "../ui/buttons/UIButton";
import { UIModal } from "../ui/UIModal";
import { UITypography } from "../ui/UITypography";

type HUDControlsIntroModalProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * A first-run modal that explains the game controls so a new player knows
 * what to press. Shown once per level (on the first run of a level) and
 * remembers itself via localStorage; the keys listed here reflect the
 * player's current (possibly rebound) keybindings.
 */
export const HUDControlsIntroModal: FC<HUDControlsIntroModalProps> = ({
  open,
  onClose,
}) => {
  const keybindings = useSettingsStore(keybindingsSelector);

  const mouseControls = [
    { label: "Place a tower", keys: ["Click a tile"] },
    { label: "View or sell a tower", keys: ["Click a tower"] },
    { label: "Rotate the camera", keys: ["Drag"] },
  ];

  const keyboardControls = [
    {
      label: "Move the camera",
      keys: [
        keybindings.cameraForward,
        keybindings.cameraBackward,
        keybindings.cameraLeft,
        keybindings.cameraRight,
        keybindings.cameraUp,
        keybindings.cameraDown,
      ],
    },
    { label: "Pause / Resume", keys: [keybindings.pause] },
    { label: "Open / close menu", keys: [keybindings.menu] },
  ];

  const renderRow = (row: { label: string; keys: string[] }) => (
    <div key={row.label} className="flex items-center justify-between gap-4">
      <UITypography variant="medium" className="text-left">
        {row.label}
      </UITypography>
      <div className="flex flex-wrap justify-end gap-1">
        {row.keys.map((key) => (
          <UITypography
            key={key}
            as="kbd"
            variant="buttons1"
            className="rounded-none border border-border bg-input/30 px-2 py-0.5"
          >
            {key.startsWith("Key") || key.includes("+")
              ? formatKeyCode(key)
              : key}
          </UITypography>
        ))}
      </div>
    </div>
  );

  return (
    <UIModal
      open={open}
      title="How to play"
      icon={<Keyboard className="size-4 text-primary" />}
      className="max-w-md"
      dismissible={false}
      footer={
        <UIButton variant="secondary" onClick={onClose}>
          Got it
        </UIButton>
      }
      onOpenChange={onClose}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          {mouseControls.map(renderRow)}
        </div>
        <div className="flex flex-col gap-2">
          {keyboardControls.map(renderRow)}
        </div>
        <UITypography
          variant="small"
          className="leading-relaxed text-muted-foreground"
        >
          You can watch controls later in &quot;Settings&quot; /
          &quot;Controls&quot;.
        </UITypography>
      </div>
    </UIModal>
  );
};
