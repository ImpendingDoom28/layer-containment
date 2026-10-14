import { create } from "zustand";
import { persist } from "zustand/middleware";

import { GAME_NAME_ID } from "../../constants/game";
import {
  DEFAULT_KEYBINDINGS,
  type KeybindingsConfig,
  type KeybindingKey,
} from "../keybindingsConstants";

type SettingsStoreState = {
  pauseWhenTabHidden: boolean;
  keybindings: KeybindingsConfig;
};

type SettingsStoreActions = {
  setPauseWhenTabHidden: (pause: boolean) => void;
  setKeybinding: (key: KeybindingKey, value: string) => void;
  resetKeybindings: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const DEFAULT_STATE: SettingsStoreState = {
  pauseWhenTabHidden: true,
  keybindings: { ...DEFAULT_KEYBINDINGS },
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setPauseWhenTabHidden: (pause) => {
        set({ pauseWhenTabHidden: pause });
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
    }
  )
);

export const pauseWhenTabHiddenSelector = (state: SettingsStore) =>
  state.pauseWhenTabHidden;
export const setPauseWhenTabHiddenSelector = (state: SettingsStore) =>
  state.setPauseWhenTabHidden;
export const keybindingsSelector = (state: SettingsStore) => state.keybindings;
export const setKeybindingSelector = (state: SettingsStore) =>
  state.setKeybinding;
export const resetKeybindingsSelector = (state: SettingsStore) =>
  state.resetKeybindings;
