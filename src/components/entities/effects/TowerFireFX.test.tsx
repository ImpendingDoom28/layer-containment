import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import {
  Group,
  Mesh,
  BoxGeometry,
  MeshBasicMaterial,
  Object3D,
  Sprite,
} from "three";

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
  const body = new Group();
  body.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()));
  const turret = new Object3D();
  const bodyRef = { current: body };
  const turretRef = { current: turret };
  const renderer = await ReactThreeTestRenderer.create(
    <SimulationClockProvider>
      <ClockCapture />
      <TowerFireFX
        tower={tower}
        color={tower.color}
        bodyContainerRef={bodyRef}
        turretNodeRef={turretRef}
        towerHeight={1}
      />
    </SimulationClockProvider>
  );
  return { renderer, body, turret };
};

// The body-pulse marker is the FX's only rendered node: a `<primitive>` whose
// instance is a Group clone of the body (one child) re-pointed at the pulse
// material.
const getMarker = (renderer: Renderer): Group => {
  const marker = renderer.scene
    .findAll((node) => node.type === "Group")
    .find((node) => node.instance.children.length === 1) as
    { instance: Group } | undefined;
  expect(marker).toBeDefined();
  return marker!.instance;
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
  it("pulses the body glow on its own shot and decays it back to zero", async () => {
    const { renderer } = await createHarness();
    try {
      await advanceFrame(renderer, 0);
      const marker = getMarker(renderer);
      expect(marker.visible).toBe(false);
      const pulseMaterial = marker.children[0].material as MeshBasicMaterial;
      expect(pulseMaterial.opacity).toBe(0);

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      await advanceFrame(renderer, 1);
      const atShot = pulseMaterial.opacity;
      expect(marker.visible).toBe(true);
      expect(atShot).toBeGreaterThan(0);

      // A few frames later the glow is weaker (quadratic falloff)…
      await advanceFrame(renderer, 1.1);
      expect(pulseMaterial.opacity).toBeLessThan(atShot);

      // …and fully decayed well past the pulse duration.
      await advanceFrame(renderer, 1.5);
      expect(pulseMaterial.opacity).toBe(0);
      expect(marker.visible).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("ignores other towers' shots", async () => {
    const { renderer } = await createHarness();
    try {
      await advanceFrame(renderer, 0);
      const marker = getMarker(renderer);
      const pulseMaterial = marker.children[0].material as MeshBasicMaterial;

      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID + 1);
      });
      await advanceFrame(renderer, 1);
      expect(pulseMaterial.opacity).toBe(0);
      expect(marker.visible).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("recoils the turret node (dip + 0.95×) on a shot and springs back", async () => {
    const { renderer, turret } = await createHarness();
    try {
      await ReactThreeTestRenderer.act(async () => {
        emitFire(TOWER_ID);
      });
      // On the shot's frame the barrel dips (rotates down) and scales to
      // 0.95×.
      await advanceFrame(renderer, 1);
      expect(turret.rotation.x).toBeGreaterThan(0);
      expect(turret.scale.x).toBeCloseTo(0.95, 5);

      // By the end of the recoil the barrel is back at rest.
      await advanceFrame(renderer, 1.3);
      expect(turret.rotation.x).toBe(0);
      expect(turret.scale.x).toBeCloseTo(1, 5);
    } finally {
      renderer.unmount();
    }
  });

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
});
