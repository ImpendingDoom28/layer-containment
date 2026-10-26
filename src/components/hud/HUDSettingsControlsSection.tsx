import { useEffect, useState, type FC } from "react";
import { useTranslation } from "react-i18next";

import {
  formatKeyCode,
  matchesControlSchemePreset,
  normalizeKeyToBinding,
} from "../../core/keybindings";
import {
  CONTROL_SCHEMES,
  VISIBLE_KEYBINDING_DEFINITIONS,
  type ControlSchemeId,
  type KeybindingKey,
} from "../../core/keybindingsConstants";
import {
  controlSchemeSelector,
  keybindingsSelector,
  resetKeybindingsSelector,
  setControlSchemeSelector,
  setKeybindingSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";
import { UIButton } from "../ui/buttons/UIButton";
import { UISelect } from "../ui/UISelect";
import { UITable, UITableCell, UITableRow } from "../ui/UITable";
import { UITypography } from "../ui/UITypography";
import clsx from "clsx";

export const HUDSettingsControlsSection: FC = () => {
  const { t } = useTranslation();
  const keybindings = useSettingsStore(keybindingsSelector);
  const setKeybinding = useSettingsStore(setKeybindingSelector);
  const resetKeybindings = useSettingsStore(resetKeybindingsSelector);
  const controlScheme = useSettingsStore(controlSchemeSelector);
  const setControlScheme = useSettingsStore(setControlSchemeSelector);
  const [rebindingKey, setRebindingKey] = useState<KeybindingKey | null>(null);

  useEffect(() => {
    if (!rebindingKey) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        setRebindingKey(null);
        return;
      }

      const binding = normalizeKeyToBinding(e);
      if (binding) {
        setKeybinding(rebindingKey, binding);
      }
      setRebindingKey(null);
    };

    globalThis.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      globalThis.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
  }, [rebindingKey, setKeybinding]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <UITypography variant="body">{t("settings.controls")}</UITypography>
        <UIButton
          onClick={resetKeybindings}
          variant="ghost"
          size="xs"
          disabled={
            matchesControlSchemePreset(keybindings, controlScheme) ||
            !!rebindingKey
          }
        >
          {t("settings.reset")}
        </UIButton>
      </div>

      <div className="flex items-center justify-between gap-4">
        <UITypography variant="medium">{t("settings.controlScheme")}</UITypography>
        <UISelect
          data-testid="control-scheme-select"
          value={controlScheme}
          disabled={!!rebindingKey}
          onChange={(event) =>
            setControlScheme(event.target.value as ControlSchemeId)
          }
          className="w-36"
          aria-label={t("settings.controlScheme")}
        >
          {CONTROL_SCHEMES.map((scheme) => (
            <option key={scheme} value={scheme}>
              {t(`settings.schemes.${scheme}`)}
            </option>
          ))}
        </UISelect>
      </div>

      <UITable>
        {VISIBLE_KEYBINDING_DEFINITIONS.map((definition) => {
          const isRebinding = rebindingKey === definition.key;
          const binding = keybindings[definition.key];

          return (
            <UITableRow key={definition.key}>
              <UITableCell className="py-1.5 pr-4">
                {t(definition.label)}
              </UITableCell>
              <UITableCell align="right" plain className="py-1.5">
                <button
                  type="button"
                  data-testid={`keybinding-row-${definition.key}`}
                  aria-label={t("controls.rebind", {
                    label: t(definition.label),
                  })}
                  onClick={() => setRebindingKey(definition.key)}
                  className={clsx(
                    "inline-flex min-w-[88px] items-center justify-center gap-1 rounded-none border px-2.5 py-1 text-xs",
                    isRebinding
                      ? "border-primary bg-primary/15 text-primary-foreground"
                      : "border-border bg-input/30 hover:bg-input/50"
                  )}
                >
                  {isRebinding ? (
                    <UITypography variant="buttons1">
                      {t("settings.pressAKey")}
                    </UITypography>
                  ) : (
                    <UITypography as={"kbd"} variant="buttons1">
                      {formatKeyCode(binding)}
                    </UITypography>
                  )}
                </button>
              </UITableCell>
            </UITableRow>
          );
        })}
      </UITable>
    </section>
  );
};
