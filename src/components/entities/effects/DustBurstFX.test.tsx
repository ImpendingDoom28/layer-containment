import { beforeEach, describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useThree } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import { DustBurstFX } from "./DustBurstFX";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame (with the clock unpaused, the simulation
// time equals the raw time and the time scale is 1).
let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

// The scene graph objects come from RTTR's own three instance (a different
// module copy than this file's), so `instanceof` against this file's `three`
// never matches — match by the `.type` string instead.
type SceneObject = {
  type: string;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  material: {
    type: string;
    opacity: number;
    blending: number;
    transparent: boolean;
  };
  traverse?: (fn: (o: SceneObject) => void) => void;
  children: SceneObject[];
};

const DELAY = 0.3; // the drop duration (the dust lands on impact)
const DURATION = 0.45;
const RING_RADIUS = 0.75;

const QUAT = new Quaternion().setFromUnitVectors(
  new Vector3(0, 1, 0),
  new Vector3(0.3, 0.9, 0.3).normalize()
);

const createHarness = async (props: {
  delay?: number;
  duration?: number;
  onComplete?: () => void;
} = {}) => {
  const { delay = DELAY, duration = DURATION, onComplete } = props;
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <DustBurstFX
        position={[1, 2, 3]}
        quaternion={QUAT}
        color="#d6c7a8"
        delay={delay}
        duration={duration}
        onComplete={onComplete}
      />
    </SimulationClockProvider>
  );
  return { renderer };
};

const advanceFrame = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

const findGroup = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found = scene.children.find((c) => c.type === "Group");
  expect(found).toBeDefined();
  return found!;
};

// The settling ring is the only additive mesh; the debris shards are lit
// (standard, normal-blended) meshes. Distinguish by `material.blending`
// (THREE.AdditiveBlending === 2, THREE.NormalBlending === 1).
const findRing = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found: SceneObject[] = [];
  scene.traverse?.((o) => {
    if (o.type === "Mesh" && o.material.blending === 2) found.push(o);
  });
  expect(found.length).toBe(1);
  return found[0];
};

const findShards = (renderer: Renderer): SceneObject[] => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found: SceneObject[] = [];
  scene.traverse?.((o) => {
    if (o.type === "Mesh" && o.material.blending === 1) found.push(o);
  });
  expect(found.length).toBeGreaterThan(0);
  return found;
};

beforeEach(() => {
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("DustBurstFX", () => {
  it("places the burst group at the impact point, oriented to the surface normal", async () => {
    const { renderer } = await createHarness();
    try {
      const group = findGroup(renderer);
      expect(group.position.x).toBeCloseTo(1, 5);
      expect(group.position.y).toBeCloseTo(2, 5);
      expect(group.position.z).toBeCloseTo(3, 5);
      expect(group.quaternion.x).toBeCloseTo(QUAT.x, 5);
      expect(group.quaternion.y).toBeCloseTo(QUAT.y, 5);
      expect(group.quaternion.z).toBeCloseTo(QUAT.z, 5);
      expect(group.quaternion.w).toBeCloseTo(QUAT.w, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("stays idle (collapsed ring, hidden puffs) until the drop's impact delay elapses", async () => {
    const { renderer } = await createHarness();
    try {
      const ring = findRing(renderer);
      const shards = findShards(renderer);

      // Establish the burst's start time, then a frame still inside the delay
      // (before the drop has impacted): the dust has not started yet.
      await advanceFrame(renderer, 0.05);
      await advanceFrame(renderer, 0.2);
      expect(ring.scale.x).toBeLessThanOrEqual(1e-3);
      for (const shard of shards) {
        expect(shard.visible).toBe(false);
      }
    } finally {
      renderer.unmount();
    }
  });

  it("swells the settling ring and pops the shards out once the delay elapses", async () => {
    const { renderer } = await createHarness();
    try {
      const ring = findRing(renderer);
      const shards = findShards(renderer);

      // Past the delay, partway through the burst: the ring has swollen toward
      // its radius and the shards are visible and moving out.
      await advanceFrame(renderer, 0.05);
      await advanceFrame(renderer, 0.5);
      expect(ring.scale.x).toBeGreaterThan(0.2);
      expect(ring.scale.x).toBeLessThan(RING_RADIUS);
      for (const shard of shards) {
        expect(shard.visible).toBe(true);
        // A shard has travelled out from the centre.
        expect(
          Math.hypot(shard.position.x, shard.position.z)
        ).toBeGreaterThan(0);
      }
      // The ring is rendered additively and faintly (see-through).
      expect(ring.material.blending).toBe(2); // THREE.AdditiveBlending
      expect(ring.material.transparent).toBe(true);
      expect(ring.material.opacity).toBeGreaterThan(0);
      expect(ring.material.opacity).toBeLessThan(0.5);
      // The debris shards are lit (they pick up the scene lights) and start
      // opaque (solid chunks of ground), not flat unlit sprites.
      for (const shard of shards) {
        expect(shard.material.type).toBe("MeshStandardMaterial");
        expect(shard.material.opacity).toBe(1);
      }
    } finally {
      renderer.unmount();
    }
  });

  it("keeps the dust clear of the tower base (ring inner edge + shards stay outside)", async () => {
    const { renderer } = await createHarness();
    try {
      const ring = findRing(renderer);
      const shards = findShards(renderer);

      const BASE_RADIUS = 0.3; // the default `baseRadius`
      const RING_INNER_FRACTION = 0.92; // matches the shared thin-band ring
      // The largest shard's bounding radius (the tetrahedron's circumscribed
      // sphere radius, 1, scaled to the shard's max size and grown by the kick).
      const SHARD_MAX_RADIUS = 0.09 * (0.5 + 0.8) * 1.3;

      // Sample the whole burst (from impact through completion) and verify the
      // dust never overlaps the model: the ring's inner edge sits on the base
      // radius and each shard's bounding radius stays outside it.
      const sample = async (rawTime: number) => {
        await advanceFrame(renderer, rawTime);
        if (ring.scale.x > 1e-3) {
          expect(ring.scale.x * RING_INNER_FRACTION).toBeGreaterThanOrEqual(
            BASE_RADIUS - 1e-6
          );
        }
        for (const shard of shards) {
          if (!shard.visible) continue;
          const radius = Math.hypot(shard.position.x, shard.position.z);
          expect(radius - SHARD_MAX_RADIUS).toBeGreaterThanOrEqual(
            BASE_RADIUS - 1e-6
          );
        }
      };
      // Impact (delay) → end of the burst.
      await sample(DELAY - 0.05); // before impact: nothing visible
      await sample(DELAY); // just as the dust kicks up
      await sample(DELAY + DURATION / 2); // mid-burst
      await sample(DELAY + DURATION - 0.05); // near the end
    } finally {
      renderer.unmount();
    }
  });

  it("settles the burst back to rest and hides it when done", async () => {
    const { renderer } = await createHarness();
    try {
      const ring = findRing(renderer);
      const shards = findShards(renderer);

      await advanceFrame(renderer, 0.05);
      // Run well past the delay + duration: the burst has fully dissipated.
      await advanceFrame(renderer, 0.05 + DELAY + DURATION + 0.5);
      expect(ring.scale.x).toBeLessThanOrEqual(1e-3);
      expect(ring.material.opacity).toBe(0);
      for (const shard of shards) {
        expect(shard.visible).toBe(false);
      }
    } finally {
      renderer.unmount();
    }
  });

  it("invokes onComplete exactly once when the burst finishes", async () => {
    let completed = 0;
    const { renderer } = await createHarness({
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      // Before the delay elapses nothing has completed.
      await advanceFrame(renderer, 0.05);
      await advanceFrame(renderer, 0.2);
      expect(completed).toBe(0);

      // After the delay + duration the burst has finished.
      await advanceFrame(renderer, 0.05 + DELAY + DURATION + 0.2);
      expect(completed).toBe(1);

      // No further completions after it has already fired.
      await advanceFrame(renderer, 5);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });
});
