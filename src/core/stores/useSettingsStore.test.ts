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
    bloomEnabled: true,
    shadowsEnabled: true,
    controlScheme: DEFAULT_CONTROL_SCHEME,
    keybindings: { ...CONTROL_SCHEME_PRESETS[DEFAULT_CONTROL_SCHEME] },
  });
});

describe("useSettingsStore bloom", () => {
  it("defaults to enabled", () => {
    expect(state().bloomEnabled).toBe(true);
  });

  it("toggles with setBloomEnabled", () => {
    state().setBloomEnabled(false);
    expect(state().bloomEnabled).toBe(false);
    state().setBloomEnabled(true);
    expect(state().bloomEnabled).toBe(true);
  });
});

describe("useSettingsStore shadows", () => {
  it("defaults to enabled", () => {
    expect(state().shadowsEnabled).toBe(true);
  });

  it("toggles with setShadowsEnabled", () => {
    state().setShadowsEnabled(false);
    expect(state().shadowsEnabled).toBe(false);
    state().setShadowsEnabled(true);
    expect(state().shadowsEnabled).toBe(true);
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
