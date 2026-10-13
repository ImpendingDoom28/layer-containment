import { useEffect, useState, type FC } from "react";

import {
  DEFAULT_KEYBINDINGS,
  KEYBINDING_DEFINITIONS,
  VISIBLE_KEYBINDING_DEFINITIONS,
  formatKeyCode,
  normalizeKeyToBinding,
  type KeybindingKey,
  type KeybindingsConfig,
} from "../../core/keybindings";
import {
  keybindingsSelector,
  resetKeybindingsSelector,
  setKeybindingSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";
import { UIButton } from "../ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";

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

  // Capture the next key press while a row is being rebound. Escape cancels
  // the rebind; any other key (or chord) becomes the new binding. The capture
  // phase + stopPropagation keeps the pressed key from also firing game
  // controls or closing an open menu.
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

      const binding = normalizeKeyToBinding(e.code, e);
      if (binding) {
        setKeybinding(rebindingKey, binding);
      }
      setRebindingKey(null);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () =>
      window.removeEventListener("keydown", handleKeyDown, {
        capture: true,
      });
  }, [rebindingKey, setKeybinding]);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <UITypography variant="medium">Controls</UITypography>
        <UIButton
          onClick={resetKeybindings}
          variant="ghost"
          size="xs"
          disabled={isAtDefaults(keybindings)}
        >
          Reset
        </UIButton>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className="py-1.5 pr-4 text-left">
              <UITypography
                variant="medium"
                as="span"
                className="text-muted-foreground"
              >
                Control
              </UITypography>
            </th>
            <th className="py-1.5 text-right">
              <UITypography
                variant="medium"
                as="span"
                className="text-muted-foreground"
              >
                Keybinding
              </UITypography>
            </th>
          </tr>
        </thead>
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
                    className={
                      isRebinding
                        ? "inline-flex min-w-[88px] items-center justify-center gap-1 rounded-none border border-primary bg-primary/15 px-2.5 py-1 text-xs text-primary-foreground"
                        : "inline-flex min-w-[88px] items-center justify-center gap-1 rounded-none border border-border bg-input/30 px-2.5 py-1 text-xs hover:bg-input/50"
                    }
                  >
                    {isRebinding ? (
                      <span>Press a key…</span>
                    ) : (
                      <kbd className="font-medium">
                        {formatKeyCode(binding)}
                      </kbd>
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
