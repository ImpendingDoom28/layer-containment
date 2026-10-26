import { afterEach, describe, expect, it } from "vitest";

import { useSettingsStore } from "./useSettingsStore";
import {
  CONTROL_SCHEME_PRESETS,
  DEFAULT_CONTROL_SCHEME,
} from "../keybindingsConstants";

const state = () => useSettingsStore.getState();

afterEach(() => {
  // Restore a clean, default settings state between tests.
  useSettingsStore.setState({
    pauseWhenTabHidden: true,
    controlScheme: DEFAULT_CONTROL_SCHEME,
    keybindings: { ...CONTROL_SCHEME_PRESETS[DEFAULT_CONTROL_SCHEME] },
  });
});

describe("useSettingsStore control scheme", () => {
  it("defaults to the keyboard scheme with its preset bindings", () => {
    expect(state().controlScheme).toBe("keyboard");
    expect(state().keybindings).toEqual(CONTROL_SCHEME_PRESETS.keyboard);
  });

  it("switches to the mobile scheme and applies its preset bindings", () => {
    state().setControlScheme("mobile");
    expect(state().controlScheme).toBe("mobile");
    expect(state().keybindings).toEqual(CONTROL_SCHEME_PRESETS.mobile);
  });

  it("keeps per-key rebinding after a scheme switch", () => {
    state().setControlScheme("mobile");
    state().setKeybinding("pause", "KeyP");
    expect(state().keybindings.pause).toBe("KeyP");
  });

  it("resets keybindings to the active scheme preset, not always to the defaults", () => {
    state().setControlScheme("mobile");
    state().setKeybinding("pause", "KeyP");
    state().resetKeybindings();
    expect(state().keybindings).toEqual(CONTROL_SCHEME_PRESETS.mobile);
  });

  it("resets to the keyboard preset when the keyboard scheme is active", () => {
    state().setKeybinding("pause", "KeyP");
    state().resetKeybindings();
    expect(state().keybindings).toEqual(CONTROL_SCHEME_PRESETS.keyboard);
  });
});
