import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useThree } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import { CometStrikeFX } from "./CometStrikeFX";

// The node test environment has no `window`, so the real `useReducedMotion`
// (guarded by `typeof window`) would always report false. Mock it with a
// mutable flag so a test can opt into reduced motion.
const { reduced } = vi.hoisted(() => ({ reduced: { value: false } }));
vi.mock("../../../core/hooks/useReducedMotion", () => ({
  useReducedMotion: () => reduced.value,
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame (unpaused, so simulation time = raw time
// and the time scale is 1).
let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const POSITION: [number, number, number] = [4, 6, -2];
// A non-identity surface-normal orientation (tilted ~30° around X) so the
// orientation test is meaningful (an identity quaternion would pass trivially).
const QUAT = new Quaternion().setFromUnitVectors(
  new Vector3(0, 1, 0),
  new Vector3(0.5, 0.866, 0).normalize()
);

const createHarness = async (props: {
  onImpact?: () => void;
  onComplete?: () => void;
} = {}) => {
  const { onImpact, onComplete } = props;
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <CometStrikeFX
        position={POSITION}
        quaternion={QUAT}
        onImpact={onImpact}
        onComplete={onComplete}
      />
    </SimulationClockProvider>
  );
  return { renderer };
};

const advanceTo = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

// The scene graph objects come from RTTR's own three instance (a different
// module copy than this file's), so `instanceof` against this file's `three`
// never matches — match by the `.type` string instead.
type SceneObject = {
  type: string;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  material?: { opacity: number };
  geometry?: { type: string };
  traverse?: (fn: (o: SceneObject) => void) => void;
  children: SceneObject[];
};

const collect = (renderer: Renderer, type: string): SceneObject[] => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found: SceneObject[] = [];
  scene.traverse?.((o) => {
    if (o.type === type) found.push(o);
  });
  return found;
};

const findGroup = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const group = scene.children.find((c) => c.type === "Group");
  expect(group).toBeDefined();
  return group!;
};

// The impact ripple is the only ring mesh (the debris shards are icosahedra).
const findRipple = (renderer: Renderer): SceneObject => {
  const ring = collect(renderer, "Mesh").find(
    (o) => o.geometry?.type === "RingGeometry"
  );
  expect(ring).toBeDefined();
  return ring!;
};

const positionMagnitude = (o: SceneObject): number =>
  Math.hypot(o.position.x, o.position.y, o.position.z);

beforeEach(() => {
  reduced.value = false;
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("CometStrikeFX", () => {
  it("places the strike group at the impact point, oriented to the surface normal", async () => {
    const { renderer } = await createHarness();
    try {
      const group = findGroup(renderer);
      expect(group.position.x).toBeCloseTo(POSITION[0], 5);
      expect(group.position.y).toBeCloseTo(POSITION[1], 5);
      expect(group.position.z).toBeCloseTo(POSITION[2], 5);
      expect(group.quaternion.x).toBeCloseTo(QUAT.x, 5);
      expect(group.quaternion.y).toBeCloseTo(QUAT.y, 5);
      expect(group.quaternion.z).toBeCloseTo(QUAT.z, 5);
      expect(group.quaternion.w).toBeCloseTo(QUAT.w, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("keeps the comet hidden before the first frame (the strike has not started)", async () => {
    const { renderer } = await createHarness();
    try {
      // The JSX starts every sprite hidden; no frame has run yet, so the
      // comet is not on screen.
      expect(collect(renderer, "Sprite").every((s) => !s.visible)).toBe(true);
    } finally {
      renderer.unmount();
    }
  });

  it("shows the comet in flight, off the surface, before the impact", async () => {
    const { renderer } = await createHarness();
    try {
      await advanceTo(renderer, 0); // establish the strike's start time
      await advanceTo(renderer, 0.6); // ~halfway down the 1.2 s flight

      // The comet head (and tail) are visible and positioned away from the
      // impact point (in flight, not yet struck): at least one visible sprite
      // sits off the surface.
      const sprites = collect(renderer, "Sprite");
      expect(
        sprites.some((s) => s.visible && positionMagnitude(s) > 5)
      ).toBe(true);

      // No impact yet: the ripple is still collapsed (its scale, since the
      // ripple sits at the group's local origin).
      expect(findRipple(renderer).scale.x).toBeLessThanOrEqual(1e-3);
    } finally {
      renderer.unmount();
    }
  });

  it("fires onImpact once at the strike and shows the fireball + ripple", async () => {
    let impacts = 0;
    const { renderer } = await createHarness({
      onImpact: () => {
        impacts += 1;
      },
    });
    try {
      await advanceTo(renderer, 0);
      await advanceTo(renderer, 1.0); // still in flight
      expect(impacts).toBe(0);

      // Just past the 1.2 s flight: the comet reaches the surface.
      await advanceTo(renderer, 1.21);
      expect(impacts).toBe(1);
      // The ripple is no longer collapsed (it grows via scale from the
      // group's local origin).
      expect(findRipple(renderer).scale.x).toBeGreaterThan(0);

      // A bit later the scorch has opened up and a sprite sits at the impact
      // point (the fireball / the striking head).
      await advanceTo(renderer, 1.35);
      expect(findRipple(renderer).scale.x).toBeGreaterThan(0.1);
      const atImpact = collect(renderer, "Sprite").some(
        (s) => s.visible && positionMagnitude(s) < 1e-3
      );
      expect(atImpact).toBe(true);

      // A later frame does not fire the impact again.
      await advanceTo(renderer, 1.6);
      expect(impacts).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("invokes onComplete once once the whole strike (flight + impact) has settled", async () => {
    let completed = 0;
    const { renderer } = await createHarness({
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      await advanceTo(renderer, 0);
      await advanceTo(renderer, 1.6); // flight + most of the impact
      expect(completed).toBe(0);

      // Past the 1.7 s total (1.2 flight + 0.5 impact) the effect is done.
      await advanceTo(renderer, 1.75);
      expect(completed).toBe(1);

      // No further completions after it has already fired.
      await advanceTo(renderer, 2.5);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("still reveals (onImpact) when a single frame jumps straight past the impact window", async () => {
    // A large delta (e.g. the tab was throttled, then resumed) can advance the
    // strike straight to completion in one frame, skipping the 1.2–1.7 s impact
    // window. onImpact must still fire exactly once (or the portal stays hidden
    // for the whole run) before the strike completes.
    let impacts = 0;
    let completed = 0;
    const { renderer } = await createHarness({
      onImpact: () => {
        impacts += 1;
      },
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      await advanceTo(renderer, 0); // start
      await advanceTo(renderer, 2.0); // jump straight past 1.7 s
      expect(impacts).toBe(1);
      expect(completed).toBe(1);
      await advanceTo(renderer, 3.0);
      expect(impacts).toBe(1);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });

  it("skips the comet under reduced motion but still strikes and reveals", async () => {
    reduced.value = true;
    let impacts = 0;
    let completed = 0;
    const { renderer } = await createHarness({
      onImpact: () => {
        impacts += 1;
      },
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      await advanceTo(renderer, 0);
      await advanceTo(renderer, 0.6); // where the comet would be in flight

      // No comet (no visible sprite) — the descent is skipped.
      expect(collect(renderer, "Sprite").every((s) => !s.visible)).toBe(true);
      expect(impacts).toBe(0);

      // The impact still happens (a brief flash marks where the portal opens),
      // firing onImpact and then completing.
      await advanceTo(renderer, 1.21);
      expect(impacts).toBe(1);
      await advanceTo(renderer, 1.75);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });
});
