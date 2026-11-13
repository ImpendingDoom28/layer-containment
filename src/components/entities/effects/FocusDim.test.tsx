import ReactThreeTestRenderer from "@react-three/test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import type { Mesh } from "three";

import { FocusDim } from "./FocusDim";
import { useGameStore } from "../../../core/stores/useGameStore";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import type { Tower } from "../../../core/types/game";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Uniforms = Record<string, { value: unknown }>;

const getFocusMesh = (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
): Mesh => renderer.scene.findByType("Mesh").instance as Mesh;

const getUniforms = (mesh: Mesh): Uniforms =>
  (mesh.material as unknown as { uniforms: Uniforms }).uniforms;

const makeTower = (x: number, z: number, range: number): Tower =>
  ({
    id: 1,
    type: "basic",
    range,
    damage: 10,
    gridX: 0,
    gridZ: 0,
    x,
    z,
    lastFireTime: 0,
  }) as Tower;

const seedStores = (tower: Tower) => {
  useGameStore.setState({
    tileSize: 1,
    selectedTower: tower,
    // Only `relay` is indexed by the effective-stats helper; the record is
    // cast so the partial stub satisfies the store's full `TowerType` map.
    towerTypes: {
      basic: { range: tower.range, damage: tower.damage },
      relay: { range: 0 },
    } as never,
  });
  useLevelStore.setState({ gridSize: 4, towers: [tower] });
};

// `getPlanetRadius(4, 1) === 80`, so a tower at flat (0, 0) sits on the north
// pole: the surface disc is centred at world (0, 0.2, 0) with normal (0, 1, 0).
const expectTowerDisc = (uniforms: Uniforms, tower: Tower) => {
  const center = uniforms["uCenter"].value as {
    x: number;
    y: number;
    z: number;
  };
  expect(center.x).toBeCloseTo(0);
  expect(center.y).toBeCloseTo(0.2);
  expect(center.z).toBeCloseTo(0);
  const normal = uniforms["uNormal"].value as {
    x: number;
    y: number;
    z: number;
  };
  expect(normal.x).toBeCloseTo(0);
  expect(normal.y).toBeCloseTo(1);
  expect(normal.z).toBeCloseTo(0);
  expect(uniforms["uRadius"].value).toBeCloseTo(tower.range);
};

describe("FocusDim", () => {
  const tower = makeTower(0, 0, 3);

  afterEach(() => {
    useGameStore.setState({
      tileSize: 0,
      selectedTower: null,
      towerTypes: null,
    });
    useLevelStore.setState({ gridSize: 0, towers: [] });
  });

  it("mounts a fullscreen overlay (a single 3-vertex clip-space triangle)", async () => {
    useGameStore.setState({ selectedTower: null });
    useLevelStore.setState({ gridSize: 4, towers: [tower] });

    const renderer = await ReactThreeTestRenderer.create(<FocusDim />);

    try {
      const mesh = getFocusMesh(renderer);
      // The mesh renders as one fullscreen triangle (3 vertices, no camera
      // transform) and starts hidden with no selection.
      expect(
        (mesh.geometry.getAttribute("position") as { count: number }).count
      ).toBe(3);
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 0.1);
      });
      expect(mesh.visible).toBe(false);
    } finally {
      renderer.unmount();
    }
  });

  it("sets the range disc from the selected tower and fades the dim in", async () => {
    seedStores(tower);

    const renderer = await ReactThreeTestRenderer.create(<FocusDim />);

    try {
      const mesh = getFocusMesh(renderer);
      const uniforms = getUniforms(mesh);

      // The disc is the tower's real range circle on the surface tangent plane
      // (the same disc the range ring draws), not a screen circle.
      expectTowerDisc(uniforms, tower);

      // The dim starts off and eases in on the render clock.
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 0.1);
      });
      expect(uniforms["uFade"].value as number).toBeGreaterThan(0);

      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(120, 0.1);
      });
      expect(uniforms["uFade"].value as number).toBeCloseTo(1, 3);
      expect(mesh.visible).toBe(true);
    } finally {
      renderer.unmount();
    }
  });

  it("fades the dim out and hides the mesh when the selection is cleared", async () => {
    seedStores(tower);

    const renderer = await ReactThreeTestRenderer.create(<FocusDim />);

    try {
      const mesh = getFocusMesh(renderer);
      const uniforms = getUniforms(mesh);

      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(120, 0.1);
      });
      expect(uniforms["uFade"].value as number).toBeCloseTo(1, 3);

      useGameStore.setState({ selectedTower: null });

      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(120, 0.1);
      });
      expect(uniforms["uFade"].value as number).toBeCloseTo(0, 3);
      expect(mesh.visible).toBe(false);
    } finally {
      renderer.unmount();
    }
  });
});
