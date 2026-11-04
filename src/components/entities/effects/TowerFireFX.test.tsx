import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import { Object3D, Sprite } from "three";

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
const tower: TowerInstance = {
  id: TOWER_ID,
  type: "basic",
  color: "#3b82f6",
  muzzle: { muzzle: { x: 0, y: 0.37, z: 1.07 } },
  fireRate: 1,
} as TowerInstance;

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
  const turretRef = { current: turret };
  const barrelRef = { current: barrel };
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
  return { renderer, turret, barrel, barrelRef };
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

  it("recoils only the barrel (dip + 0.95×) on a shot and springs back", async () => {
    const { renderer, turret, barrel } = await createHarness();
    try {
      await advanceFrame(renderer, 0);
      expect(barrel.rotation.x).toBe(0);
      expect(barrel.scale.x).toBeCloseTo(1, 5);
      expect(turret.rotation.x).toBe(0);
      expect(turret.scale.x).toBeCloseTo(1, 5);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      // On the shot's frame the barrel dips (rotates down) and scales to
      // 0.95×…
      await advanceFrame(renderer, 1);
      expect(barrel.rotation.x).toBeGreaterThan(0);
      expect(barrel.scale.x).toBeCloseTo(0.95, 5);
      // …and the rest of the turret is left untouched.
      expect(turret.rotation.x).toBe(0);
      expect(turret.scale.x).toBeCloseTo(1, 5);

      // By the end of the recoil the barrel is back at rest.
      await advanceFrame(renderer, 1.3);
      expect(barrel.rotation.x).toBe(0);
      expect(barrel.scale.x).toBeCloseTo(1, 5);
    } finally {
      renderer.unmount();
    }
  });

  it("recoils relative to the barrel's rest transform, not absolute rest", async () => {
    const { renderer, barrel } = await createHarness();
    try {
      // Give the barrel a non-identity rest pose (as a fitted model might
      // carry) so the punch has to be relative to it.
      barrel.rotation.x = 0.2;
      barrel.scale.setScalar(2);
      await advanceFrame(renderer, 0);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      await advanceFrame(renderer, 1);
      expect(barrel.rotation.x).toBeCloseTo(0.3, 5);
      expect(barrel.scale.x).toBeCloseTo(1.9, 5);

      await advanceFrame(renderer, 1.3);
      expect(barrel.rotation.x).toBeCloseTo(0.2, 5);
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
      expect(barrel.rotation.x).toBe(0);
      expect(barrel.scale.x).toBeCloseTo(1, 5);
    } finally {
      renderer.unmount();
    }
  });
});
