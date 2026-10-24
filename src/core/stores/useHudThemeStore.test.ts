import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_HUD_THEME_ID,
  HUD_THEME_IDS,
  useHudThemeStore,
} from "./useHudThemeStore";

describe("useHudThemeStore", () => {
  beforeEach(() => {
    useHudThemeStore.setState({ theme: DEFAULT_HUD_THEME_ID });
  });

  it("starts on the default (command) theme", () => {
    expect(useHudThemeStore.getState().theme).toBe("command");
  });

  it("sets the theme explicitly", () => {
    useHudThemeStore.getState().setTheme("hologram");
    expect(useHudThemeStore.getState().theme).toBe("hologram");
  });

  it("cycles through all five themes in order", () => {
    const themes: string[] = [];
    for (let i = 0; i < HUD_THEME_IDS.length; i += 1) {
      useHudThemeStore.getState().cycleTheme();
      themes.push(useHudThemeStore.getState().theme);
    }
    expect(themes).toEqual([
      "hologram",
      "tactical",
      "arcade",
      "glass",
      "command",
    ]);
  });

  it("cycles from any theme to its successor", () => {
    useHudThemeStore.getState().setTheme("glass");
    useHudThemeStore.getState().cycleTheme();
    expect(useHudThemeStore.getState().theme).toBe("command");

    useHudThemeStore.getState().setTheme("arcade");
    useHudThemeStore.getState().cycleTheme();
    expect(useHudThemeStore.getState().theme).toBe("glass");
  });
});
