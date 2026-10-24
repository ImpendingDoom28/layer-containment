import { create } from "zustand";
import { persist } from "zustand/middleware";

import { GAME_NAME_ID } from "../../constants/game";

/**
 * HUD theme ids, in switcher order (1..5). "command" is the original
 * design and the default.
 */
export const HUD_THEME_IDS = [
  "command",
  "hologram",
  "tactical",
  "arcade",
  "glass",
] as const;

export type HudThemeId = (typeof HUD_THEME_IDS)[number];

export const DEFAULT_HUD_THEME_ID: HudThemeId = "command";

type HudThemeStoreState = {
  theme: HudThemeId;
};

type HudThemeStoreActions = {
  setTheme: (theme: HudThemeId) => void;
  /** Cycles to the next theme, wrapping around at the end. */
  cycleTheme: () => void;
};

type HudThemeStore = HudThemeStoreState & HudThemeStoreActions;

export const useHudThemeStore = create<HudThemeStore>()(
  persist(
    (set, get) => ({
      theme: DEFAULT_HUD_THEME_ID,

      setTheme: (theme) => {
        set({ theme });
      },

      cycleTheme: () => {
        const index = HUD_THEME_IDS.indexOf(get().theme);
        const next = HUD_THEME_IDS[(index + 1) % HUD_THEME_IDS.length];
        set({ theme: next });
      },
    }),
    {
      name: `${GAME_NAME_ID}-hud-theme-v1`,
      merge: (persisted, current) => {
        // No entry in storage yet: persist calls merge with undefined.
        const persistedState = (persisted ?? {}) as Partial<HudThemeStoreState>;
        const savedTheme = persistedState.theme;
        return {
          ...current,
          theme:
            savedTheme && HUD_THEME_IDS.includes(savedTheme)
              ? savedTheme
              : DEFAULT_HUD_THEME_ID,
        };
      },
    }
  )
);

export const hudThemeSelector = (state: HudThemeStore): HudThemeId =>
  state.theme;
export const setHudThemeSelector = (state: HudThemeStore) => state.setTheme;
export const cycleHudThemeSelector = (state: HudThemeStore) => state.cycleTheme;
