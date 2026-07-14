import { describe, expect, it } from "vitest";

import { getCategoryVolume, MIN_VOLUME, toVolumeState } from "./volume";

type TestCategory = "sfx" | "music";

const baseState = {
  masterVolume: 50,
  categoryVolumes: { sfx: 50, music: 50 },
  muted: false,
};

describe("toVolumeState", () => {
  it("normalizes muted to a strict boolean", () => {
    expect(toVolumeState({ ...baseState, muted: true }).muted).toBe(true);
    expect(toVolumeState({ ...baseState, muted: false }).muted).toBe(false);
    expect(toVolumeState({ ...baseState, muted: "true" as unknown as boolean }).muted).toBe(
      false
    );
  });
});

describe("getCategoryVolume", () => {
  it("returns MIN_VOLUME when muted", () => {
    expect(
      getCategoryVolume({ ...baseState, muted: true }, "sfx")
    ).toBe(MIN_VOLUME);
  });

  it("returns a positive multiplier when unmuted", () => {
    expect(getCategoryVolume(baseState, "sfx")).toBeGreaterThan(0);
  });
});
