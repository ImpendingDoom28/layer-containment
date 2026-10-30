import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";
import type { Mesh, TorusGeometry } from "three";

import { useGameStore } from "../../core/stores/useGameStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";
import { Portal } from "./Portal";

// Portal resolves its palette from CSS custom properties, which require a DOM;
// the node test environment has none, so stub a constant colour.
vi.mock("../ui/lib/cssUtils", () => ({
  getCssColorValue: () => "#00ff00",
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

// The test renderer runs in frameloop "never" mode and does not tick the
// THREE clock, so the test advances it by hand before each frame — the exact
// value `useFrame` readers observe in the real app.
let sceneClock: { elapsedTime: number };

const PortalHarness = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return <Portal position={[0, 0.5, 0]} />;
};

const getMeshes = (renderer: Renderer): Mesh[] =>
  renderer.scene
    .findAll((node) => node.type === "Mesh")
    .map((node) => node.instance as Mesh);

// The outer ring is the only torus with radius 0.4, so it is an unambiguous
// probe of the portal's animation.
const getOuterRing = (renderer: Renderer): Mesh => {
  const ring = getMeshes(renderer).find(
    (m) =>
      m.geometry.type === "TorusGeometry" &&
      (m.geometry as TorusGeometry).parameters.radius === 0.4
  );
  if (!ring) throw new Error("outer ring not found");
  return ring;
};

const STEP = 0.016;

const advanceFrame = async (renderer: Renderer) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime += STEP;
    await renderer.advanceFrames(1, STEP);
  });
};

const setGameStatus = async (status: "playing" | "paused") => {
  await ReactThreeTestRenderer.act(async () => {
    useGameStore.getState().setGameStatus(status);
  });
};

const setupStores = () => {
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
};

describe("Portal pause behaviour", () => {
  it("keeps animating while playing", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(<PortalHarness />);

    try {
      for (let i = 0; i < 10; i++) await advanceFrame(renderer);
      // The outer ring rotates with the (paused-unaware) simulation clock, so
      // a playing world shows a non-zero rotation after a few frames.
      expect(getOuterRing(renderer).rotation.y).toBeGreaterThan(0);
    } finally {
      await renderer.unmount();
    }
  });

  it("freezes while paused", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(<PortalHarness />);

    try {
      // Warm up while playing so the portal has a non-zero rotation.
      for (let i = 0; i < 10; i++) await advanceFrame(renderer);

      // Pause. The time-scale eases to 0 over ~200ms, so let the ramp finish
      // before sampling (12 frames x 0.016s is the full ramp; use a margin).
      await setGameStatus("paused");
      for (let i = 0; i < 30; i++) await advanceFrame(renderer);

      const ring = getOuterRing(renderer);
      const frozenRotation = ring.rotation.y;

      // The world clock keeps advancing while paused; if the portal were still
      // driven by it, its rotation would keep changing. With the fix the
      // simulation clock is frozen, so it stays constant.
      for (let i = 0; i < 10; i++) await advanceFrame(renderer);
      expect(ring.rotation.y).toBeCloseTo(frozenRotation, 5);
    } finally {
      await renderer.unmount();
    }
  });
});
