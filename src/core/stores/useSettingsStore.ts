import { create } from "zustand";
import { persist } from "zustand/middleware";

import { GAME_NAME_ID } from "../../constants/game";

type SettingsStoreState = {
  pauseWhenTabHidden: boolean;
};

type SettingsStoreActions = {
  setPauseWhenTabHidden: (pause: boolean) => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const DEFAULT_STATE: SettingsStoreState = {
  pauseWhenTabHidden: true,
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_STATE,

      setPauseWhenTabHidden: (pause) => {
        set({ pauseWhenTabHidden: pause });
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
