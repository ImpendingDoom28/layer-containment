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
  CONTROL_SCHEME_PRESETS,
  CONTROL_SCHEMES,
  DEFAULT_CONTROL_SCHEME,
  type ControlSchemeId,
  type KeybindingsConfig,
  type KeybindingKey,
} from "../keybindingsConstants";

type SettingsStoreState = {
  pauseWhenTabHidden: boolean;
  language: LanguageId;
  controlScheme: ControlSchemeId;
  keybindings: KeybindingsConfig;
};

type SettingsStoreActions = {
  setPauseWhenTabHidden: (pause: boolean) => void;
  setLanguage: (language: LanguageId) => void;
  setControlScheme: (scheme: ControlSchemeId) => void;
  setKeybinding: (key: KeybindingKey, value: string) => void;
  resetKeybindings: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const normalizeControlScheme = (
  scheme: unknown
): ControlSchemeId =>
  typeof scheme === "string" &&
  (CONTROL_SCHEMES as readonly string[]).includes(scheme)
    ? (scheme as ControlSchemeId)
    : DEFAULT_CONTROL_SCHEME;

const DEFAULT_STATE: SettingsStoreState = {
  pauseWhenTabHidden: true,
  language: DEFAULT_LANGUAGE_ID,
  controlScheme: DEFAULT_CONTROL_SCHEME,
  keybindings: { ...CONTROL_SCHEME_PRESETS[DEFAULT_CONTROL_SCHEME] },
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

      setControlScheme: (scheme) => {
        // Switching schemes replaces the whole binding set with the scheme's
        // preset; per-key rebinding stays available afterwards.
        set({
          controlScheme: scheme,
          keybindings: { ...CONTROL_SCHEME_PRESETS[scheme] },
        });
      },

      setKeybinding: (key, value) => {
        set((state) => ({
          keybindings: { ...state.keybindings, [key]: value },
        }));
      },

      resetKeybindings: () => {
        set((state) => ({
          keybindings: { ...CONTROL_SCHEME_PRESETS[state.controlScheme] },
        }));
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
          controlScheme: normalizeControlScheme(persistedState.controlScheme),
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
export const controlSchemeSelector = (state: SettingsStore) =>
  state.controlScheme;
export const setControlSchemeSelector = (state: SettingsStore) =>
  state.setControlScheme;
