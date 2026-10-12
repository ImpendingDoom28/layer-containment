import { create } from "zustand";
import { persist } from "zustand/middleware";

import { GAME_NAME_ID } from "../../constants/game";

type SettingsStoreState = {
  pauseWhenTabHidden: boolean;
  /** When enabled, pausing the game is disabled while waiting for the next wave. */
  noPauseDuringWaveWait: boolean;
};

type SettingsStoreActions = {
  setPauseWhenTabHidden: (pause: boolean) => void;
  setNoPauseDuringWaveWait: (enabled: boolean) => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const DEFAULT_STATE: SettingsStoreState = {
  pauseWhenTabHidden: true,
  noPauseDuringWaveWait: true,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setPauseWhenTabHidden: (pause) => {
        set({ pauseWhenTabHidden: pause });
      },

      setNoPauseDuringWaveWait: (enabled) => {
        set({ noPauseDuringWaveWait: enabled });
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
export const noPauseDuringWaveWaitSelector = (state: SettingsStore) =>
  state.noPauseDuringWaveWait;
export const setNoPauseDuringWaveWaitSelector = (state: SettingsStore) =>
  state.setNoPauseDuringWaveWait;
