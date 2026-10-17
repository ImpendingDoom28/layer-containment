import { create } from "zustand";
import { persist } from "zustand/middleware";

import { i18n } from "../i18n/i18n";
import { GAME_NAME_ID } from "../../constants/game";
import {
  DEFAULT_LANGUAGE_ID,
  normalizeLanguageId,
  type LanguageId,
} from "../i18n/languages";
import {
  DEFAULT_KEYBINDINGS,
  type KeybindingsConfig,
  type KeybindingKey,
} from "../keybindingsConstants";

type SettingsStoreState = {
  pauseWhenTabHidden: boolean;
  language: LanguageId;
  keybindings: KeybindingsConfig;
};

type SettingsStoreActions = {
  setPauseWhenTabHidden: (pause: boolean) => void;
  setLanguage: (language: LanguageId) => void;
  setKeybinding: (key: KeybindingKey, value: string) => void;
  resetKeybindings: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const DEFAULT_STATE: SettingsStoreState = {
  pauseWhenTabHidden: true,
  language: DEFAULT_LANGUAGE_ID,
  keybindings: { ...DEFAULT_KEYBINDINGS },
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setPauseWhenTabHidden: (pause) => {
        set({ pauseWhenTabHidden: pause });
      },

      setLanguage: (language) => {
        set({ language });
        void i18n.changeLanguage(language);
      },

      setKeybinding: (key, value) => {
        set((state) => ({
          keybindings: { ...state.keybindings, [key]: value },
        }));
      },

      resetKeybindings: () => {
        set({ keybindings: { ...DEFAULT_KEYBINDINGS } });
      },
    }),
    {
      name: `${GAME_NAME_ID}-settings-v1`,
      merge: (persisted, current) => {
        const persistedState = persisted as Partial<SettingsStoreState>;
        return {
          ...current,
          ...persistedState,
          // Guard against stale or malformed stored values.
          language: normalizeLanguageId(persistedState.language),
        };
      },
    }
  )
);

export const pauseWhenTabHiddenSelector = (state: SettingsStore) =>
  state.pauseWhenTabHidden;
export const setPauseWhenTabHiddenSelector = (state: SettingsStore) =>
  state.setPauseWhenTabHidden;
export const languageSelector = (state: SettingsStore) => state.language;
export const setLanguageSelector = (state: SettingsStore) => state.setLanguage;
export const keybindingsSelector = (state: SettingsStore) => state.keybindings;
export const setKeybindingSelector = (state: SettingsStore) =>
  state.setKeybinding;
export const resetKeybindingsSelector = (state: SettingsStore) =>
  state.resetKeybindings;
