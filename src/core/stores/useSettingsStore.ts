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
  bloomEnabled: boolean;
  shadowsEnabled: boolean;
  motionBlurEnabled: boolean;
  language: LanguageId;
  controlScheme: ControlSchemeId;
  keybindings: KeybindingsConfig;
};

type SettingsStoreActions = {
  setPauseWhenTabHidden: (pause: boolean) => void;
  setBloomEnabled: (enabled: boolean) => void;
  setShadowsEnabled: (enabled: boolean) => void;
  setMotionBlurEnabled: (enabled: boolean) => void;
  setLanguage: (language: LanguageId) => void;
  setControlScheme: (scheme: ControlSchemeId) => void;
  setKeybinding: (key: KeybindingKey, value: string) => void;
  resetKeybindings: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const normalizeControlScheme = (scheme: unknown): ControlSchemeId =>
  typeof scheme === "string" &&
  (CONTROL_SCHEMES as readonly string[]).includes(scheme)
    ? (scheme as ControlSchemeId)
    : DEFAULT_CONTROL_SCHEME;

const DEFAULT_STATE: SettingsStoreState = {
  pauseWhenTabHidden: true,
  bloomEnabled: true,
  shadowsEnabled: true,
  motionBlurEnabled: true,
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

      setBloomEnabled: (enabled) => {
        set({ bloomEnabled: enabled });
      },

      setShadowsEnabled: (enabled) => {
        set({ shadowsEnabled: enabled });
      },

      setMotionBlurEnabled: (enabled) => {
        set({ motionBlurEnabled: enabled });
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
          bloomEnabled:
            typeof persistedState.bloomEnabled === "boolean"
              ? persistedState.bloomEnabled
              : DEFAULT_STATE.bloomEnabled,
          shadowsEnabled:
            typeof persistedState.shadowsEnabled === "boolean"
              ? persistedState.shadowsEnabled
              : DEFAULT_STATE.shadowsEnabled,
          motionBlurEnabled:
            typeof persistedState.motionBlurEnabled === "boolean"
              ? persistedState.motionBlurEnabled
              : DEFAULT_STATE.motionBlurEnabled,
        };
      },
    }
  )
);

export const pauseWhenTabHiddenSelector = (state: SettingsStore) =>
  state.pauseWhenTabHidden;
export const bloomEnabledSelector = (state: SettingsStore) =>
  state.bloomEnabled;
export const setBloomEnabledSelector = (state: SettingsStore) =>
  state.setBloomEnabled;
export const shadowsEnabledSelector = (state: SettingsStore) =>
  state.shadowsEnabled;
export const setShadowsEnabledSelector = (state: SettingsStore) =>
  state.setShadowsEnabled;
export const motionBlurEnabledSelector = (state: SettingsStore) =>
  state.motionBlurEnabled;
export const setMotionBlurEnabledSelector = (state: SettingsStore) =>
  state.setMotionBlurEnabled;
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
