import { create } from "zustand";

import type { UpdateStatus } from "./updateCheck";

type UpdateStoreState = {
  status: UpdateStatus;
  // Set once the failure banner is dismissed for this launch: the banner
  // must not reappear just because a later check reports the same failure.
  isFailureDismissed: boolean;
};

type UpdateStoreActions = {
  setUpdateStatus: (status: UpdateStatus) => void;
  dismissUpdateFailure: () => void;
  resetUpdateState: () => void;
};

type UpdateStore = UpdateStoreState & UpdateStoreActions;

const DEFAULT_STATE: UpdateStoreState = {
  status: "idle",
  isFailureDismissed: false,
};

export const useUpdateStore = create<UpdateStore>((set) => ({
  ...DEFAULT_STATE,

  setUpdateStatus: (status) => {
    set({ status });
  },

  dismissUpdateFailure: () => {
    set({ isFailureDismissed: true });
  },

  resetUpdateState: () => {
    set(DEFAULT_STATE);
  },
}));

export const updateStatusSelector = (state: UpdateStore) => state.status;
export const isUpdateFailureDismissedSelector = (state: UpdateStore) =>
  state.isFailureDismissed;
export const setUpdateStatusSelector = (state: UpdateStore) =>
  state.setUpdateStatus;
export const dismissUpdateFailureSelector = (state: UpdateStore) =>
  state.dismissUpdateFailure;
export const resetUpdateStateSelector = (state: UpdateStore) =>
  state.resetUpdateState;
