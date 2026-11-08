import { useThree } from "@react-three/fiber";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
} from "three";

import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useSettingsStore } from "../../../core/stores/useSettingsStore";
import type { Tower as TowerInstance } from "../../../core/types/game";
import { FRUSTUM_CULL_SNAPSHOT_EXCLUDE } from "../../../utils/frustumCulling";
import { TowerIdleAnimation } from "./TowerIdleAnimation";
import {
  getTowerIdleRigs,
  registerTowerIdleAnimation,
  unregisterTowerIdleAnimation,
  updateTowerIdleRig,
  type TowerIdleRig,
} from "./towerIdleRig";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// The tuning constants are mirrored here so the assertions stay exact (the
// same pattern the TowerFireFX test uses for the recoil constants).
const SCAN_AMPLITUDE = 0.28;
const SCAN_SPEED = 0.35;
const SCAN_FADE_IN = 1.2;
const BOB_AMPLITUDE = 0.02;
const BOB_SPEED = 1.1;
const BREATH_AMPLITUDE = 0.25;
const BREATH_SPEED = 0.9;

const phaseForTower = (towerId: number): number =>
  (towerId * 2.399963229728653) % (Math.PI * 2);

type RigFixture = {
  rig: TowerIdleRig;
  top: Object3D;
  material: MeshStandardMaterial;
};

const makeRig = (towerId: number): RigFixture => {
  const top = new Object3D();
  top.position.y = 0.5;
  top.rotation.y = 0.3;
  const material = new MeshStandardMaterial();
  material.emissive.setRGB(0.1, 0.2, 1);
  material.emissiveIntensity = 2;
  const rig: TowerIdleRig = {
    towerId,
    topNode: top,
    restY: 0.5,
    bobAmplitude: BOB_AMPLITUDE,
    emissives: [{ material, base: 2 }],
    phase: phaseForTower(towerId),
    heldYaw: 0.3,
    idleSince: null,
  };
  return { rig, top, material };
};

describe("updateTowerIdleRig", () => {
  it("breathes the emissive intensity around its rest value", () => {
    const { rig, material } = makeRig(1);
    updateTowerIdleRig(rig, 1, false, false);
    expect(material.emissiveIntensity).toBeCloseTo(
      2 * (1 + BREATH_AMPLITUDE * Math.sin(BREATH_SPEED * 1 + rig.phase)),
      6
    );
  });

  it("bobs the top node around its rest height", () => {
    const { rig, top } = makeRig(1);
    updateTowerIdleRig(rig, 2, false, false);
    expect(top.position.y).toBeCloseTo(
      0.5 + BOB_AMPLITUDE * Math.sin(BOB_SPEED * 2 + rig.phase),
      6
    );
  });

  it("phase-offsets towers so no two move in lockstep", () => {
    const a = makeRig(1);
    const b = makeRig(2);
    updateTowerIdleRig(a.rig, 3, false, false);
    updateTowerIdleRig(b.rig, 3, false, false);
    expect(a.top.position.y).not.toBeCloseTo(b.top.position.y, 6);
    expect(a.material.emissiveIntensity).not.toBeCloseTo(
      b.material.emissiveIntensity,
      6
    );
  });

  it("freezes mid-pose when the simulation clock freezes", () => {
    const { rig, top, material } = makeRig(1);
    updateTowerIdleRig(rig, 4, false, false);
    const y = top.position.y;
    const yaw = top.rotation.y;
    const intensity = material.emissiveIntensity;
    updateTowerIdleRig(rig, 4, false, false);
    expect(top.position.y).toBe(y);
    expect(top.rotation.y).toBe(yaw);
    expect(material.emissiveIntensity).toBe(intensity);
  });

  it("scans the yaw around the held aim, fading in after going idle", () => {
    const { rig, top } = makeRig(1);
    // First idle frame: the fade-in starts, so the yaw holds the last aim.
    updateTowerIdleRig(rig, 10, false, false);
    expect(top.rotation.y).toBeCloseTo(0.3, 6);
    // After the fade-in the scan sweeps at full amplitude around the held yaw.
    updateTowerIdleRig(rig, 10 + SCAN_FADE_IN + 1, false, false);
    expect(top.rotation.y).toBeCloseTo(
      0.3 +
        SCAN_AMPLITUDE *
          Math.sin(SCAN_SPEED * (10 + SCAN_FADE_IN + 1) + rig.phase),
      6
    );
  });

  it("leaves the yaw to the sim while aiming and adopts the sim's aim as the held yaw", () => {
    const { rig, top } = makeRig(1);
    // The sim's aim pass has written a new yaw this frame.
    top.rotation.y = 0.8;
    updateTowerIdleRig(rig, 5, true, false);
    expect(top.rotation.y).toBe(0.8);
    expect(rig.heldYaw).toBe(0.8);
    expect(rig.idleSince).toBeNull();
    // The bob and breathing still run while aiming.
    expect(top.position.y).toBeCloseTo(
      0.5 + BOB_AMPLITUDE * Math.sin(BOB_SPEED * 5 + rig.phase),
      6
    );
    // Once the target is lost, the first idle frame starts the fade-in at
    // the adopted aim (zero sweep amplitude)…
    updateTowerIdleRig(rig, 7, false, false);
    expect(top.rotation.y).toBeCloseTo(0.8, 6);
    // …and after the fade-in the scan sweeps at full amplitude around it.
    updateTowerIdleRig(rig, 7 + SCAN_FADE_IN + 0.5, false, false);
    expect(top.rotation.y).toBeCloseTo(
      0.8 +
        SCAN_AMPLITUDE *
          Math.sin(SCAN_SPEED * (7 + SCAN_FADE_IN + 0.5) + rig.phase),
      6
    );
  });

  it("restores the rest pose under reduced motion", () => {
    const { rig, top, material } = makeRig(1);
    updateTowerIdleRig(rig, 1, false, false);
    expect(top.position.y).not.toBe(0.5);

    updateTowerIdleRig(rig, 2, false, true);
    expect(top.position.y).toBe(0.5);
    expect(top.rotation.y).toBe(0.3);
    expect(material.emissiveIntensity).toBe(2);
  });
});

describe("registerTowerIdleAnimation", () => {
  const makeModel = () => {
    const group = new Group();
    group.scale.setScalar(0.5);
    const turret = new Object3D();
    turret.name = "Azimuth";
    turret.position.y = 1;
    const emissiveMaterial = new MeshStandardMaterial();
    emissiveMaterial.emissive.setRGB(0, 1, 1);
    const emissiveMesh = new Mesh(new BoxGeometry(1, 1, 1), emissiveMaterial);
    const plainMaterial = new MeshStandardMaterial();
    const plainMesh = new Mesh(new BoxGeometry(1, 1, 1), plainMaterial);
    turret.add(emissiveMesh);
    group.add(turret, plainMesh);
    return { group, turret, emissiveMaterial, emissiveMesh, plainMesh };
  };

  const tower = (id: number, overrides?: Partial<TowerInstance>) =>
    ({
      id,
      type: "basic",
      muzzle: { turretNode: "Azimuth", muzzle: null },
      ...overrides,
    }) as TowerInstance;

  afterEach(() => {
    for (const id of [...getTowerIdleRigs().keys()]) {
      unregisterTowerIdleAnimation(id);
    }
  });

  it("registers a rig keyed by tower id and unregisters it", () => {
    const { group } = makeModel();
    const unregister = registerTowerIdleAnimation(tower(7), group);
    expect(getTowerIdleRigs().has(7)).toBe(true);
    unregister();
    expect(getTowerIdleRigs().has(7)).toBe(false);
  });

  it("marks the turret subtree as excluded from the culling staleness snapshot", () => {
    const { group, turret } = makeModel();
    const unregister = registerTowerIdleAnimation(tower(7), group);
    expect(turret.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBe(true);
    unregister();
    expect(turret.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBeUndefined();
  });

  it("clones only the emissive materials per tower, leaving the shared GLTF materials untouched", () => {
    const { group, emissiveMaterial, emissiveMesh, plainMesh } = makeModel();
    const unregister = registerTowerIdleAnimation(tower(7), group);

    // The mesh now points at a per-tower clone; the shared original is intact.
    const clone = emissiveMesh.material as MeshStandardMaterial;
    expect(clone).not.toBe(emissiveMaterial);
    expect(clone.emissive.getHex()).toBe(emissiveMaterial.emissive.getHex());
    // Non-emissive materials are not cloned.
    expect(plainMesh.material).toBeInstanceOf(MeshStandardMaterial);

    // Breathing writes only the clone, never the shared original.
    const rig = getTowerIdleRigs().get(7)!;
    updateTowerIdleRig(rig, 1, false, false);
    expect(clone.emissiveIntensity).not.toBe(emissiveMaterial.emissiveIntensity);

    unregister();
  });

  it("restores the rest pose on unregister so a re-registration captures the true baseline", () => {
    const { group, turret: top, emissiveMesh } = makeModel();
    const unregister = registerTowerIdleAnimation(tower(7), group);
    const rig = getTowerIdleRigs().get(7)!;
    // Drive the rig to a mid-animation pose (bob + breathing).
    updateTowerIdleRig(rig, 1, false, false);
    const clone = emissiveMesh.material as MeshStandardMaterial;
    expect(top.position.y).not.toBe(1);
    expect(clone.emissiveIntensity).not.toBe(1);

    unregister();
    expect(top.position.y).toBe(1);
    expect(clone.emissiveIntensity).toBe(1);

    // Re-registering after the restore captures the model's true rest pose
    // again, not the mid-animation pose.
    const unregister2 = registerTowerIdleAnimation(tower(7), group);
    expect(getTowerIdleRigs().get(7)!.restY).toBe(1);
    expect(
      getTowerIdleRigs().get(7)!.emissives[0].base
    ).toBe(1);
    unregister2();
  });

  it("converts the bob amplitude into model-local units via the model fit scale", () => {
    const { group } = makeModel();
    registerTowerIdleAnimation(tower(7), group);
    expect(getTowerIdleRigs().get(7)!.bobAmplitude).toBeCloseTo(
      BOB_AMPLITUDE / 0.5,
      6
    );
  });

  it("animates a tower without a firing turret via its config idleNode (the relay)", () => {
    const { group, turret } = makeModel();
    registerTowerIdleAnimation(
      tower(8, {
        type: "relay",
        muzzle: { muzzle: null },
        idleNode: "Azimuth",
      }),
      group
    );
    expect(getTowerIdleRigs().get(8)!.topNode).toBe(turret);
  });
});

// The test renderer runs in frameloop "never" mode and never advances the
// THREE clock, so the test drives raw elapsed time by writing to the scene
// clock directly before each frame (with the clock unpaused, the simulation
// time equals the raw time).
let sceneClock: { elapsedTime: number };

const ClockCapture = () => {
  const clock = useThree((s) => s.clock) as unknown as { elapsedTime: number };
  sceneClock = clock;
  return null;
};

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const advanceFrame = async (renderer: Renderer, rawTime: number) => {
  await ReactThreeTestRenderer.act(async () => {
    sceneClock.elapsedTime = rawTime;
    await renderer.advanceFrames(1, 1);
  });
};

describe("TowerIdleAnimation driver", () => {
  beforeEach(() => {
    useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
    useSettingsStore.setState({ pauseWhenTabHidden: false });
  });

  afterEach(() => {
    useGameStore.setState({ gameStatus: "playing", isPageVisible: true });
    for (const id of [...getTowerIdleRigs().keys()]) {
      unregisterTowerIdleAnimation(id);
    }
  });

  const registerRig = (id: number) => {
    const top = new Object3D();
    top.name = "Azimuth";
    const group = new Group();
    group.add(top);
    registerTowerIdleAnimation(
      { id, type: "basic", muzzle: { turretNode: "Azimuth", muzzle: null } } as TowerInstance,
      group
    );
    return top;
  };

  it("animates every registered tower from the one shared frame loop and freezes on pause", async () => {
    const topA = registerRig(21);
    const topB = registerRig(22);
    const renderer = await ReactThreeTestRenderer.create(
      <SimulationClockProvider>
        <ClockCapture />
        <TowerIdleAnimation hasTowerTarget={() => false} />
      </SimulationClockProvider>
    );
    try {
      await advanceFrame(renderer, 0);
      await advanceFrame(renderer, 1);
      const movedA = topA.position.y;
      const movedB = topB.position.y;
      expect(movedA).not.toBe(0);
      // Per-tower phase offsets: the two towers sit at different heights.
      expect(movedA).not.toBeCloseTo(movedB, 6);

      // Pause: the simulation clock freezes, so the idle motion freezes
      // mid-pose even though raw time keeps advancing.
      await ReactThreeTestRenderer.act(async () => {
        useGameStore.setState({ gameStatus: "paused" });
      });
      await advanceFrame(renderer, 2);
      const frozenA = topA.position.y;
      const frozenYawA = topA.rotation.y;
      await advanceFrame(renderer, 3);
      await advanceFrame(renderer, 4);
      expect(topA.position.y).toBe(frozenA);
      expect(topA.rotation.y).toBe(frozenYawA);
    } finally {
      renderer.unmount();
    }
  });

  it("leaves the turret yaw alone while the tower has a target", async () => {
    const top = registerRig(23);
    const renderer = await ReactThreeTestRenderer.create(
      <SimulationClockProvider>
        <ClockCapture />
        <TowerIdleAnimation hasTowerTarget={() => true} />
      </SimulationClockProvider>
    );
    try {
      top.rotation.y = 0.6;
      await advanceFrame(renderer, 0);
      await advanceFrame(renderer, 1);
      // The driver never writes the yaw while the sim's aim pass owns it,
      // but the bob still runs.
      expect(top.rotation.y).toBe(0.6);
      expect(top.position.y).not.toBe(0);
    } finally {
      renderer.unmount();
    }
  });
});
