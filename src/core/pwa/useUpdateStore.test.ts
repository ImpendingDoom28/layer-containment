import { afterEach, describe, expect, it } from "vitest";

import {
  dismissUpdateFailureSelector,
  isUpdateFailureDismissedSelector,
  resetUpdateStateSelector,
  setUpdateStatusSelector,
  updateStatusSelector,
  useUpdateStore,
} from "./useUpdateStore";

afterEach(() => {
  useUpdateStore.getState().resetUpdateState();
});

describe("useUpdateStore", () => {
  it("starts in the idle state with the failure not dismissed", () => {
    const state = useUpdateStore.getState();
    expect(updateStatusSelector(state)).toBe("idle");
    expect(isUpdateFailureDismissedSelector(state)).toBe(false);
  });

  it("tracks the update status", () => {
    useUpdateStore.getState().setUpdateStatus("checking");
    expect(useUpdateStore.getState().status).toBe("checking");
    useUpdateStore.getState().setUpdateStatus("ready");
    expect(updateStatusSelector(useUpdateStore.getState())).toBe("ready");
  });

  it("dismisses the failure for this launch only (until reset)", () => {
    useUpdateStore.getState().setUpdateStatus("failed");
    expect(isUpdateFailureDismissedSelector(useUpdateStore.getState())).toBe(
      false
    );

    dismissUpdateFailureSelector(useUpdateStore.getState())();
    expect(isUpdateFailureDismissedSelector(useUpdateStore.getState())).toBe(
      true
    );

    // A new launch starts clean: the banner can show again if it fails.
    resetUpdateStateSelector(useUpdateStore.getState())();
    expect(useUpdateStore.getState().status).toBe("idle");
    expect(isUpdateFailureDismissedSelector(useUpdateStore.getState())).toBe(
      false
    );
  });

  it("exposes the actions through selectors", () => {
    const state = useUpdateStore.getState();
    expect(setUpdateStatusSelector(state)).toBe(state.setUpdateStatus);
    expect(dismissUpdateFailureSelector(state)).toBe(
      state.dismissUpdateFailure
    );
    expect(resetUpdateStateSelector(state)).toBe(state.resetUpdateState);
  });
});
