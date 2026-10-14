import { useEffect, useState, type FC } from "react";

import { formatKeyCode, normalizeKeyToBinding } from "../../core/keybindings";
import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_DEFINITIONS,
  VISIBLE_KEYBINDING_DEFINITIONS,
  type KeybindingKey,
  type KeybindingsConfig,
} from "../../core/keybindingsConstants";
import {
  keybindingsSelector,
  resetKeybindingsSelector,
  setKeybindingSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";
import { UIButton } from "../ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";
import clsx from "clsx";

const isAtDefaults = (config: KeybindingsConfig): boolean =>
  KEYBINDING_DEFINITIONS.every(
    (definition) =>
      config[definition.key] === DEFAULT_KEYBINDINGS[definition.key]
  );

export const HUDSettingsControlsSection: FC = () => {
  const keybindings = useSettingsStore(keybindingsSelector);
  const setKeybinding = useSettingsStore(setKeybindingSelector);
  const resetKeybindings = useSettingsStore(resetKeybindingsSelector);
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
        <UITypography variant="body">Controls</UITypography>
        <UIButton
          onClick={resetKeybindings}
          variant="ghost"
          size="xs"
          disabled={isAtDefaults(keybindings) || !!rebindingKey}
        >
          Reset
        </UIButton>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {VISIBLE_KEYBINDING_DEFINITIONS.map((definition) => {
            const isRebinding = rebindingKey === definition.key;
            const binding = keybindings[definition.key];

            return (
              <tr key={definition.key}>
                <td className="py-1.5 pr-4">
                  <UITypography variant="medium" as="span">
                    {definition.label}
                  </UITypography>
                </td>
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    data-testid={`keybinding-row-${definition.key}`}
                    aria-label={`Rebind ${definition.label}`}
                    onClick={() => setRebindingKey(definition.key)}
                    className={clsx(
                      "inline-flex min-w-[88px] items-center justify-center gap-1 rounded-none border px-2.5 py-1 text-xs",
                      isRebinding
                        ? "border-primary bg-primary/15  text-primary-foreground"
                        : " border-border bg-input/30  hover:bg-input/50"
                    )}
                  >
                    {isRebinding ? (
                      <UITypography variant="buttons1">
                        Press a key…
                      </UITypography>
                    ) : (
                      <UITypography as={"kbd"} variant="buttons1">
                        {formatKeyCode(binding)}
                      </UITypography>
                    )}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};
