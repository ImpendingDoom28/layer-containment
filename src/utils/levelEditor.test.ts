import { describe, expect, it } from "vitest";

import type { WaterBodyConfig } from "../core/types/game";
import {
  clampWaterToGrid,
  withRecalculatedWaterCoordinates,
} from "./levelEditor";

const makeConfig = (variant?: string): WaterBodyConfig => ({
  id: 1,
  gridX: 2,
  gridZ: 3,
  shape: "box",
  color: "#38bdf8",
  ...(variant !== undefined ? { variant: variant as never } : {}),
});

describe("withRecalculatedWaterCoordinates", () => {
  it("resolves an omitted variant to full", () => {
    const body = withRecalculatedWaterCoordinates(makeConfig(), 5, 1);
    expect(body.variant).toBe("full");
  });

  it("preserves an explicit variant", () => {
    const body = withRecalculatedWaterCoordinates(
      makeConfig("half-n"),
      5,
      1
    );
    expect(body.variant).toBe("half-n");
  });
});

describe("clampWaterToGrid", () => {
  it("keeps a water body's variant when clamping", () => {
    const clamped = clampWaterToGrid(makeConfig("corner-sw"), 5);
    expect(clamped.variant).toBe("corner-sw");
  });

  it("clamps out-of-bounds grid coordinates while preserving the variant", () => {
    const clamped = clampWaterToGrid(
      { ...makeConfig("half-e"), gridX: 99, gridZ: -3 },
      5
    );
    expect(clamped.gridX).toBe(4);
    expect(clamped.gridZ).toBe(0);
    expect(clamped.variant).toBe("half-e");
  });
});
