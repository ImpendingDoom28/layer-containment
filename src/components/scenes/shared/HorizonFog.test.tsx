import ReactThreeTestRenderer from "@react-three/test-renderer";
import { Color, Fog, Scene } from "three";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { HorizonFog } from "./HorizonFog";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe("HorizonFog", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "document", {
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        visibilityState: "visible",
        documentElement: {},
      },
      configurable: true,
    });
    // Resolve the scene-sky-base token to its real hex so the fog color can be
    // asserted; getCssColorValue reads it via getComputedStyle.
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({
        getPropertyValue: (name: string) =>
          name === "--scene-sky-base" ? " #0a0a0f " : "",
      }))
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("attaches a linear scene fog matched to the sky base color", async () => {
    const renderer = await ReactThreeTestRenderer.create(<HorizonFog />);

    try {
      const fog = (renderer.scene.instance as Scene).fog as Fog;
      expect(fog.isFog).toBe(true);
      // Tuned so the fog reads as a haze from the default gameplay view while
      // the planet's far rim melts into the sky.
      expect(fog.near).toBe(6);
      expect(fog.far).toBe(40);
      // The fog melts the planet into the same near-black the sky already is.
      expect(fog.color.getStyle()).toBe(new Color("#0a0a0f").getStyle());
    } finally {
      renderer.unmount();
    }
  });

  it("honors a custom far range (used by the asset showcase scene)", async () => {
    const renderer = await ReactThreeTestRenderer.create(
      <HorizonFog far={240} />
    );

    try {
      const fog = (renderer.scene.instance as Scene).fog as Fog;
      expect(fog.isFog).toBe(true);
      expect(fog.near).toBe(6);
      expect(fog.far).toBe(240);
    } finally {
      renderer.unmount();
    }
  });
});
