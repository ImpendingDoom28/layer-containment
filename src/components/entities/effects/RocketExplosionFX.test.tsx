import { beforeEach, describe, expect, it } from "vitest";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useThree } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import { RocketExplosionFX } from "./RocketExplosionFX";

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

const RADIUS = 1.5;
// A non-identity surface-normal orientation (tilted ~30° around X) so the
// orientation test is meaningful (an identity quat would pass trivially).
const QUAT = new Quaternion().setFromUnitVectors(
  new Vector3(0, 1, 0),
  new Vector3(0.5, 0.866, 0).normalize()
);

const createHarness = async (
  props: {
    radius?: number;
    color?: string;
    duration?: number;
    onComplete?: () => void;
  } = {}
) => {
  const { radius = RADIUS, color = "#ef4444", duration, onComplete } = props;
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <RocketExplosionFX
        position={[1, 2, 3]}
        quaternion={QUAT}
        radius={radius}
        color={color}
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

// The scene graph objects come from RTTR's own three instance (a different
// module copy than this file's), so `instanceof` against this file's `three`
// never matches — match by the `.type` string instead.
type SceneObject = {
  type: string;
  position: { x: number; y: number; z: number };
  quaternion: { x: number; y: number; z: number; w: number };
  scale: { x: number; y: number; z: number };
  visible: boolean;
  material: { opacity: number; blending: number; transparent: boolean };
  traverse?: (fn: (o: SceneObject) => void) => void;
  children: SceneObject[];
};

const findFireball = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found: SceneObject[] = [];
  scene.traverse?.((o) => {
    if (o.type === "Sprite") found.push(o);
  });
  expect(found.length).toBe(1);
  return found[0];
};

// The shockwave is a single ring mesh in the group.
const findRing = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found: SceneObject[] = [];
  scene.traverse?.((o) => {
    if (o.type === "Mesh") found.push(o);
  });
  expect(found.length).toBe(1);
  return found[0];
};

const findExplosionGroup = (renderer: Renderer): SceneObject => {
  const scene = renderer.scene.instance as unknown as SceneObject;
  const found = scene.children.find((c) => c.type === "Group");
  expect(found).toBeDefined();
  return found!;
};

beforeEach(() => {
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("RocketExplosionFX", () => {
  it("places the explosion group at the impact point, oriented to the surface normal", async () => {
    const { renderer } = await createHarness();
    try {
      const group = findExplosionGroup(renderer);
      expect(group.position.x).toBeCloseTo(1, 5);
      expect(group.position.y).toBeCloseTo(2, 5);
      expect(group.position.z).toBeCloseTo(3, 5);
      // The group's quaternion is the passed surface-normal orientation.
      expect(group.quaternion.x).toBeCloseTo(QUAT.x, 5);
      expect(group.quaternion.y).toBeCloseTo(QUAT.y, 5);
      expect(group.quaternion.z).toBeCloseTo(QUAT.z, 5);
      expect(group.quaternion.w).toBeCloseTo(QUAT.w, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("grows the shockwave out to the blast radius", async () => {
    const { renderer } = await createHarness();
    try {
      const ring = findRing(renderer);
      // Starts collapsed (the frame loop has not run yet).
      expect(ring.scale.x).toBeLessThanOrEqual(1e-3);

      // Establish the burst's start time on the first frame, then advance
      // partway through the burst: the ring has swollen toward the radius.
      await advanceFrame(renderer, 0.01);
      await advanceFrame(renderer, 0.3);
      expect(ring.scale.x).toBeGreaterThan(0.5);
      expect(ring.scale.x).toBeLessThan(RADIUS);

      // By the end of the default duration it has landed on the radius.
      await advanceFrame(renderer, 1.0);
      expect(ring.scale.x).toBeCloseTo(RADIUS, 3);
    } finally {
      renderer.unmount();
    }
  });

  it("renders the shockwave additively and faintly (see-through, still visible)", async () => {
    const { renderer } = await createHarness();
    try {
      const ring = findRing(renderer);
      // Additive blending (the shockwave glows / the ground shows through) and
      // transparency — the "see-through but visible" property.
      expect(ring.material.blending).toBe(2); // THREE.AdditiveBlending
      expect(ring.material.transparent).toBe(true);
      // While it is playing it is visible but kept faint (a low opacity).
      await advanceFrame(renderer, 0.01);
      await advanceFrame(renderer, 0.2);
      expect(ring.material.opacity).toBeGreaterThan(0);
      expect(ring.material.opacity).toBeLessThan(0.5);
    } finally {
      renderer.unmount();
    }
  });

  it("shows the fireball early and hides it once the flash has resolved", async () => {
    const { renderer } = await createHarness();
    try {
      const fireball = findFireball(renderer);
      expect(fireball.visible).toBe(false);

      // Establish the burst's start time on the first frame, then partway
      // through the fireball window the flash is visible.
      await advanceFrame(renderer, 0.1);
      await advanceFrame(renderer, 0.3);
      expect(fireball.visible).toBe(true);
      expect(fireball.material.opacity).toBeGreaterThan(0);

      // Past the fireball's fraction of the duration the flash is gone.
      await advanceFrame(renderer, 0.9);
      expect(fireball.visible).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("invokes onComplete exactly once when the burst finishes", async () => {
    let completed = 0;
    const { renderer } = await createHarness({
      duration: 0.4,
      onComplete: () => {
        completed += 1;
      },
    });
    try {
      await advanceFrame(renderer, 0.1);
      expect(completed).toBe(0);

      await advanceFrame(renderer, 0.6);
      expect(completed).toBe(1);

      // No further completions after it has already fired.
      await advanceFrame(renderer, 1.2);
      expect(completed).toBe(1);
    } finally {
      renderer.unmount();
    }
  });
});
