import { memo, type FC } from "react";
import { useTranslation } from "react-i18next";

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

type ControlRow = {
  labelKey: string;
  keys: string[];
};

/**
 * A first-run modal that explains the game controls so a new player knows
 * what to press. Shown once per level (on the first run of a level) and
 * remembers itself via localStorage; the keys listed here reflect the
 * player's current (possibly rebound) keybindings.
 */
export const HUDControlsIntroModal: FC<HUDControlsIntroModalProps> = memo(
  ({ open, onClose }) => {
    const { t } = useTranslation();
    const keybindings = useSettingsStore(keybindingsSelector);

    const mouseControls: ControlRow[] = [
      {
        labelKey: "controlsIntro.placeTower",
        keys: [t("controlsIntro.clickATile")],
      },
      {
        labelKey: "controlsIntro.viewOrSellTower",
        keys: [t("controlsIntro.clickATower")],
      },
      {
        labelKey: "controlsIntro.rotateCamera",
        keys: [t("controlsIntro.drag")],
      },
    ];

    const keyboardControls: ControlRow[] = [
      {
        labelKey: "controlsIntro.moveCamera",
        keys: [
          keybindings.cameraForward,
          keybindings.cameraBackward,
          keybindings.cameraLeft,
          keybindings.cameraRight,
          keybindings.cameraUp,
          keybindings.cameraDown,
        ],
      },
      { labelKey: "controlsIntro.pauseResume", keys: [keybindings.pause] },
      { labelKey: "controlsIntro.openCloseMenu", keys: [keybindings.menu] },
    ];

    const renderRow = (row: ControlRow) => (
      <div
        key={row.labelKey}
        className="flex items-center justify-between gap-4"
      >
        <UITypography variant="medium" className="text-left">
          {t(row.labelKey as "controlsIntro.placeTower")}
        </UITypography>
        <div className="flex flex-wrap justify-end gap-1">
          {row.keys.map((key) => (
            <UITypography
              key={key}
              as="kbd"
              variant="buttons1"
              className="rounded-none border border-border bg-input/30 px-2 py-0.5"
            >
              {/^(Key|Digit|Numpad)/.test(key) || key.includes("+")
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
        title={t("controlsIntro.title")}
        icon={<Keyboard className="size-4 text-primary" />}
        className="max-w-md"
        dismissible={false}
        footer={
          <UIButton variant="secondary" onClick={onClose}>
            {t("common.gotIt")}
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
            {t("controlsIntro.laterInSettings", {
              settings: t("settings.title"),
              controls: t("settings.controls"),
            })}
          </UITypography>
        </div>
      </UIModal>
    );
  }
);

HUDControlsIntroModal.displayName = "HUDControlsIntroModal";
