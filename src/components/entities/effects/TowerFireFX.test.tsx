import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { Object3D, Sprite, Vector3 } from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import type { Tower as TowerInstance } from "../../../core/types/game";
import { TowerFireFX } from "./TowerFireFX";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame (with the clock unpaused, the simulation
// time equals the raw time).
let sceneClock: { elapsedTime: number };

const TOWER_ID = 42;
const MUZZLE = { x: 0, y: 0.37, z: 1.07 };
const ORIGIN = { x: 0, y: 0, z: 0 };
const tower: TowerInstance = {
  id: TOWER_ID,
  type: "basic",
  color: "#3b82f6",
  muzzle: { muzzle: MUZZLE },
  fireRate: 1,
} as TowerInstance;

// The recoil pullback (a fraction of the muzzle distance, bottom scale) is
// mirrored here so the assertions stay exact.
const PULLBACK_FRACTION = 0.15;
const MIN_SCALE = 0.95;
// The unit direction the barrel should kick toward for a given rest position:
// from the barrel tip (the muzzle point) toward its own pivot (the rest
// position), i.e. `normalize(rest − muzzle)`.
const kickDirection = (rest: { x: number; y: number; z: number }) =>
  new Vector3(
    rest.x - MUZZLE.x,
    rest.y - MUZZLE.y,
    rest.z - MUZZLE.z
  ).normalize();
// The kick magnitude for a given rest position: a fraction of the tip → base
// distance (|muzzle − rest|) scaled by the rest scale.
const kickLength = (rest: { x: number; y: number; z: number }, scale: number) =>
  new Vector3(
    MUZZLE.x - rest.x,
    MUZZLE.y - rest.y,
    MUZZLE.z - rest.z
  ).length() *
  PULLBACK_FRACTION *
  scale;

// Captures the scene clock so a test can drive raw elapsed time by writing to
// it directly (the test renderer never advances the clock on its own).
const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const createHarness = async () => {
  // The ref bags must keep their identity across the renderer's re-renders
  // (each `advanceFrames` re-renders the tree), exactly like the real
  // `Tower`'s `useRef` props — so they are created once per test here.
  const turret = new Object3D();
  const barrel = new Object3D();
  turret.add(barrel);
  // Nullable so a test can detach the nodes (the fallback-attach case).
  const turretRef: { current: Object3D | null } = { current: turret };
  const barrelRef: { current: Object3D | null } = { current: barrel };
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <TowerFireFX
        tower={tower}
        color={tower.color}
        turretNodeRef={turretRef}
        barrelNodeRef={barrelRef}
        towerHeight={1}
      />
    </SimulationClockProvider>
  );
  return { renderer, turret, barrel, turretRef, barrelRef };
};

// Finds the flash Sprite in the real three.js scene graph (it is added
// imperatively to either the turret node or the FX's fallback group, so it is
// not part of the React tree that RTTR's `findAll` walks).
const findSprite = (renderer: Renderer): Sprite => {
  const scene = renderer.scene.instance as Object3D;
  const found: Sprite[] = [];
  scene.traverse((o) => {
    if (o instanceof Sprite) found.push(o);
  });
  expect(found.length).toBe(1);
  return found[0];
};

const getSprite = (turret: Object3D): Sprite => {
  const sprite = turret.children.find((c) => c instanceof Sprite) as
    Sprite | undefined;
  expect(sprite).toBeDefined();
  return sprite!;
};

const advanceFrame = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

const emitFire = (towerId: number) =>
  gameEvents.emit(GameEvent.TOWER_FIRE, { towerId });

beforeEach(() => {
  useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
  useSettingsStore.setState({ pauseWhenTabHidden: false });
});

describe("TowerFireFX", () => {
  it("flashes the muzzle sprite at the barrel tip on a shot, then hides it", async () => {
    const { renderer, turret } = await createHarness();
    try {
      await advanceFrame(renderer, 0);
      const sprite = getSprite(turret);
      expect(sprite.visible).toBe(false);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      await advanceFrame(renderer, 1);
      expect(sprite.visible).toBe(true);
      expect(sprite.material.opacity).toBeGreaterThan(0);
      // The sprite sits at the turret's local muzzle tip.
      expect(sprite.position.z).toBeCloseTo(1.07, 5);

      // Past the flash duration the sprite is hidden again.
      await advanceFrame(renderer, 1.2);
      expect(sprite.visible).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("shows the fallback flash on a shot before the turret node is registered", async () => {
    const { renderer, turretRef, barrelRef } = await createHarness();
    try {
      // Detach the nodes (the model is still loading, or the load failed) so
      // the FX has no turret to attach the sprite to.
      turretRef.current = null;
      barrelRef.current = null;
      await advanceFrame(renderer, 0);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      await advanceFrame(renderer, 1);
      // The sprite must be attached to the FX's fallback group, not skipped.
      const sprite = findSprite(renderer);
      expect(sprite.visible).toBe(true);
      expect(sprite.parent).toBeTruthy();
      expect(sprite.parent?.type).toBe("Group");
      // Fallback height for a non-laser tower (towerHeight × 0.7).
      expect(sprite.position.y).toBeCloseTo(0.7, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("recoils only the barrel: it kicks back toward the base and shrinks on the shot, then springs back", async () => {
    const { renderer, turret, barrel } = await createHarness();
    try {
      await advanceFrame(renderer, 0);
      expect(barrel.position.length()).toBeCloseTo(0, 5);
      expect(barrel.scale.x).toBeCloseTo(1, 5);
      expect(turret.position.length()).toBeCloseTo(0, 5);
      expect(turret.rotation.x).toBe(0);
      expect(turret.scale.x).toBeCloseTo(1, 5);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      // On the shot's frame the barrel has kicked back a fraction of the
      // tip → base distance along that axis and shrunk to 0.95×…
      await advanceFrame(renderer, 1);
      const displacement = new Vector3().copy(barrel.position);
      expect(displacement.length()).toBeCloseTo(kickLength(ORIGIN, 1), 2);
      expect(
        displacement.normalize().dot(kickDirection(ORIGIN))
      ).toBeGreaterThan(0.999);
      expect(barrel.scale.x).toBeCloseTo(MIN_SCALE, 5);
      // …and the rest of the turret is left untouched.
      expect(turret.position.length()).toBeCloseTo(0, 5);
      expect(turret.rotation.x).toBe(0);
      expect(turret.scale.x).toBeCloseTo(1, 5);

      // By the end of the recoil the barrel is back at rest.
      await advanceFrame(renderer, 1.3);
      expect(barrel.position.length()).toBeCloseTo(0, 5);
      expect(barrel.scale.x).toBeCloseTo(1, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("recoils relative to the barrel's rest transform, not absolute rest", async () => {
    const { renderer, barrel } = await createHarness();
    try {
      // Give the barrel a non-identity rest pose (as a fitted model might
      // carry) so the kick has to be relative to it.
      const rest = { x: 0.05, y: -0.1, z: 0 };
      barrel.position.set(rest.x, rest.y, rest.z);
      barrel.scale.setScalar(2);
      await advanceFrame(renderer, 0);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      // The kick is relative to the barrel's own pivot (a fraction of the
      // tip → base distance, scaled by the rest scale) and the shrink scales
      // the rest scale.
      await advanceFrame(renderer, 1);
      const displacement = new Vector3()
        .copy(barrel.position)
        .sub(new Vector3(rest.x, rest.y, rest.z));
      expect(displacement.length()).toBeCloseTo(kickLength(rest, 2), 2);
      expect(displacement.normalize().dot(kickDirection(rest))).toBeGreaterThan(
        0.999
      );
      expect(barrel.scale.x).toBeCloseTo(MIN_SCALE * 2, 5);

      // Back at exactly the (non-identity) rest pose when done.
      await advanceFrame(renderer, 1.3);
      expect(barrel.position.x).toBeCloseTo(rest.x, 5);
      expect(barrel.position.y).toBeCloseTo(rest.y, 5);
      expect(barrel.position.z).toBeCloseTo(rest.z, 5);
      expect(barrel.scale.x).toBeCloseTo(2, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("ignores other towers' shots", async () => {
    const { renderer, turret, barrel } = await createHarness();
    try {
      await advanceFrame(renderer, 0);
      const sprite = getSprite(turret);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID + 1);
      });
      await advanceFrame(renderer, 1);
      expect(sprite.visible).toBe(false);
      expect(barrel.position.length()).toBeCloseTo(0, 5);
      expect(barrel.scale.x).toBeCloseTo(1, 5);
    } finally {
      renderer.unmount();
    }
  });
});
