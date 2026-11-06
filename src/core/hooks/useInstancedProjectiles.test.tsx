import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityIdProvider } from "../contexts/EntityIdContext";
import { SimulationClockProvider } from "../contexts/SimulationClockContext";
import { enemyActions } from "../ecs/actions/enemyActions";
import { world } from "../ecs/world";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type { Enemy, Projectile } from "../types/game";
import { patchInstancedTrailFade } from "../../utils/instancedTrailFadePatch";
import {
  computeTrailPose,
  useInstancedProjectiles,
} from "./useInstancedProjectiles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type TestApi = ReturnType<typeof useInstancedProjectiles>;

let api: TestApi | null = null;
const onHit = vi.fn();

const TestScene = (): ReactElement => {
  // The instanced pools initialize in a post-mount effect and surface through
  // a ref read during render, so the scene must re-render once after mount
  // (the live app re-renders constantly; RTTR would not on its own).
  const [, setTick] = useState(0);
  useEffect(() => {
    setTick((t) => t + 1);
  }, []);

  api = useInstancedProjectiles({
    onHit,
    onRemove: vi.fn(),
    defaultColor: "#ffffff",
    // A wide hit radius so the 1-second test frames land within it — the
    // hook's hit check compares the projectile to the enemy's world position.
    hitThreshold: 20,
  });
  return <>{api.InstancedProjectiles}</>;
};

// The enemy sits at flat (0, 0) on the default (zero-sized) level, which maps
// to world (0, 0.6, 0): pole surface point (0, 0.2, 0) plus the 0.4 size
// offset along the +Y normal.
const baseEnemy = (): Enemy => ({
  id: 1,
  type: "basic",
  name: "E",
  health: 100,
  maxHealth: 100,
  speed: 1,
  reward: 3,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
});

const fireAtEnemy = (
  overrides: Partial<Parameters<TestApi["fireProjectile"]>[0]> = {}
): Projectile =>
  api!.fireProjectile({
    towerId: 1,
    towerType: "basic",
    projectileType: "single",
    startX: 100,
    startY: 0.6,
    startZ: 0,
    targetX: 0,
    targetY: 0.6,
    targetZ: 0,
    targetId: 1,
    damage: 10,
    speed: 15,
    range: 120,
    color: "#3b82f6",
    ...overrides,
  });

const advance = async (frames = 1) => {
  await ReactThreeTestRenderer.act(async () => {
    for (let index = 0; index < frames; index += 1) {
      api!.updateProjectiles({
        deltaSeconds: 1,
        simulationTimeSeconds: index + 1,
        canResolveGameplay: true,
      });
    }
  });
};

beforeEach(() => {
  onHit.mockClear();
  useLevelStore.getState().resetLevelState();
  useGameStore.getState().setGameStatus("playing");
  enemyActions(world).clearAllEnemies();
});

describe("computeTrailPose", () => {
  it("returns null for a stationary projectile", () => {
    expect(computeTrailPose(1, 2, 3, 0, 0, 0, 0.1)).toBeNull();
  });

  it("orients the streak along the travel direction, trailing behind the head", () => {
    const pose = computeTrailPose(10, 0.6, 0, -15, 0, 0, 0.1);
    expect(pose).not.toBeNull();
    if (!pose) return;

    // Speed 15 saturates the length cap of 0.8.
    expect(pose.length).toBeCloseTo(0.8);
    expect(pose.scale.x).toBeCloseTo(0.05);
    expect(pose.scale.y).toBeCloseTo(0.8);
    expect(pose.scale.z).toBeCloseTo(0.05);

    // The +Y head sits at the projectile position; the center is half the
    // streak length back along the travel direction.
    expect(pose.position.x).toBeCloseTo(10.4);
    expect(pose.position.y).toBeCloseTo(0.6);
    expect(pose.position.z).toBeCloseTo(0);

    // The quaternion maps the streak's +Y axis onto the travel direction.
    const head = new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion);
    expect(head.x).toBeCloseTo(-1);
    expect(head.y).toBeCloseTo(0);
    expect(head.z).toBeCloseTo(0);
  });

  it("clamps short streaks to the minimum length", () => {
    const pose = computeTrailPose(0, 0, 0, 0.1, 0, 0, 0.1);
    expect(pose).not.toBeNull();
    if (pose) expect(pose.length).toBeCloseTo(0.08);
  });
});

describe("patchInstancedTrailFade", () => {
  const makeShader = () => ({
    vertexShader:
      "void main() {\n#include <common>\n#include <begin_vertex>\n#include <project_vertex>\n}",
    fragmentShader:
      "void main() {\n#include <color_fragment>\n#include <emissivemap_fragment>\ngl_FragColor = vec4(1.0);\n}",
  });

  it("injects a head-to-tail fade driven by the local Y vertex attribute", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shader = makeShader() as any;
    patchInstancedTrailFade(shader);

    expect(shader.vertexShader).toContain("varying float vTrailFade;");
    expect(shader.vertexShader).toContain("vTrailFade = position.y;");
    expect(shader.fragmentShader).toContain("varying float vTrailFade;");
    expect(shader.fragmentShader).toContain(
      "float trailFade = clamp( 0.5 + vTrailFade, 0.0, 1.0 );"
    );
    expect(shader.fragmentShader).toContain("diffuseColor.a *= trailFade;");
    expect(shader.fragmentShader).toContain(
      "totalEmissiveRadiance *= trailFade;"
    );
  });

  it("is idempotent", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const shader = makeShader() as any;
    patchInstancedTrailFade(shader);
    const vertexBefore = shader.vertexShader;
    const fragmentBefore = shader.fragmentShader;
    patchInstancedTrailFade(shader);
    expect(shader.vertexShader).toBe(vertexBefore);
    expect(shader.fragmentShader).toBe(fragmentBefore);
  });
});

describe("useInstancedProjectiles trails", () => {
  const createRenderer = async () =>
    ReactThreeTestRenderer.create(
      <EntityIdProvider>
        <SimulationClockProvider>
          <TestScene />
        </SimulationClockProvider>
      </EntityIdProvider>
    );

  it("acquires a trail slot for sphere projectiles and releases it on hit", async () => {
    const renderer = await createRenderer();
    try {
      enemyActions(world).spawnEnemy(baseEnemy());

      const before = api!.getTrailPoolStats()!;
      expect(before.inUse).toBe(0);
      expect(before.maxInstances).toBe(500);

      const projectile = fireAtEnemy();
      expect(projectile.id).toBeGreaterThan(0);
      expect(api!.getTrailPoolStats()!.inUse).toBe(1);

      // Six 1-second frames at speed 15 bring the projectile from x=100 to
      // x=10, within the 20-wide hit radius of the enemy at x=0.
      await advance(6);
      expect(onHit).toHaveBeenCalledTimes(1);
      expect(api!.getActiveProjectiles()).toHaveLength(0);
      expect(api!.getTrailPoolStats()!.inUse).toBe(0);
    } finally {
      await renderer.unmount();
    }
  });

  it("does not allocate trail slots for beams or chain bolts", async () => {
    const renderer = await createRenderer();
    try {
      enemyActions(world).spawnEnemy(baseEnemy());

      fireAtEnemy({ projectileType: "beam" });
      fireAtEnemy({ projectileType: "chain" });
      expect(api!.getTrailPoolStats()!.inUse).toBe(0);

      await advance(3);
      expect(api!.getTrailPoolStats()!.inUse).toBe(0);
    } finally {
      await renderer.unmount();
    }
  });

  it("releases every trail slot on clearAllProjectiles", async () => {
    const renderer = await createRenderer();
    try {
      enemyActions(world).spawnEnemy(baseEnemy());

      fireAtEnemy();
      fireAtEnemy({ startX: 80, targetX: 20 });
      expect(api!.getTrailPoolStats()!.inUse).toBe(2);

      api!.clearAllProjectiles();
      expect(api!.getTrailPoolStats()!.inUse).toBe(0);
      expect(api!.getActiveProjectiles()).toHaveLength(0);
    } finally {
      await renderer.unmount();
    }
  });
});
