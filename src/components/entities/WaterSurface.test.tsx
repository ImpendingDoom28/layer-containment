import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it, vi } from "vitest";
import { BoxGeometry, type MeshStandardMaterial, type Group, type Mesh } from "three";

import { useGameStore } from "../../core/stores/useGameStore";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { useLevelEditorStore } from "../../core/stores/useLevelEditorStore";
import { flatFieldToSphereSurface, getPlanetRadius } from "../../utils/planetSurfaceMapping";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { WATER_VARIANTS } from "../../utils/tileOccupancy";
import { WaterSurface } from "./WaterSurface";

// The tile reads its palette from CSS custom properties, which require a DOM;
// the node test environment has none, so stub a constant colour.
vi.mock("../ui/lib/cssUtils", () => ({
  getCssColorValue: () => "#00ff00",
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const gridSize = 20;
const tileSize = 1;
const pathYOffset = 0.05;
// The water bed recess: the top face sits at the middle of the 0.05 basin
// between the shore (pathYOffset) and the sphere (0).
const waterBedOffset = 0.025;
const gridX = 10;
const gridZ = 9;
// A partial variant (corner-nw): the water is the quarter at the inner corner,
// the land the remaining pentagon.
const partialVariantCode = WATER_VARIANTS.indexOf("corner-nw");

const setupStores = () => {
  useGameStore.setState({ tileSize, pathYOffset });
  useLevelStore.setState({ gridSize });
  useLevelEditorStore.setState({ hoveredTile: null });
};

const getMeshes = (renderer: Renderer): Mesh[] =>
  renderer.scene
    .findAll((node) => node.type === "Mesh")
    .map((node) => node.instance as Mesh);

const findGroup = (renderer: Renderer): Group | null =>
  renderer.scene
    .findAll((node) => node.type === "Group")
    .map((node) => node.instance as Group)
    .find((g) => g.children.length === 2) ?? null;

// The mesh centre of the full-tile slab: the sphere surface point at the tile
// cell lifted to the shore (pathYOffset/2) and recessed into the basin
// (WATER_BED_OFFSET along the local -Y) — here those cancel, so the slab
// centre sits exactly on the surface.
const expectedSlabCenter = () => {
  const worldX = tileToWorldCoordinate(gridX, gridSize, tileSize);
  const worldZ = tileToWorldCoordinate(gridZ, gridSize, tileSize);
  const radius = getPlanetRadius(gridSize, tileSize);
  const { surfacePoint, normal } = flatFieldToSphereSurface(
    worldX,
    worldZ,
    radius
  );
  return surfacePoint
    .clone()
    .addScaledVector(normal, pathYOffset / 2 - waterBedOffset);
};

describe("WaterSurface", () => {
  it("renders one full-tile box slab recessed into the water basin", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(
      <WaterSurface gridX={gridX} gridZ={gridZ} canPlace={false} onClick={() => {}} />
    );

    try {
      const meshes = getMeshes(renderer);
      expect(meshes).toHaveLength(1);

      const mesh = meshes[0];
      // The full-tile slab is a box at tile size and the full path height,
      // subdivided on the top face so the idle ripple has vertices to swell.
      expect(mesh.geometry.type).toBe("BoxGeometry");
      expect((mesh.geometry as BoxGeometry).parameters.width).toBe(tileSize);
      expect((mesh.geometry as BoxGeometry).parameters.height).toBe(pathYOffset);

      // The slab sits on the sphere at the tile's cell, recessed so the top
      // face (the water surface) is a half-basin below the shore.
      expect(mesh.position.distanceTo(expectedSlabCenter())).toBeLessThan(1e-6);
    } finally {
      await renderer.unmount();
    }
  });

  it("renders a partial variant as a water slab plus a dry land slab", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(
      <WaterSurface
        gridX={gridX}
        gridZ={gridZ}
        waterVariantCode={partialVariantCode}
        canPlace={false}
        onClick={() => {}}
      />
    );

    try {
      const group = findGroup(renderer);
      expect(group).not.toBeNull();
      expect(group!.children).toHaveLength(2);

      const meshes = getMeshes(renderer);
      expect(meshes).toHaveLength(2);

      // In the group's local frame the water slab is recessed a half basin
      // below the shore; the land slab sits at the shore (the group origin).
      const positions = meshes.map((m) => m.position.y).sort((a, b) => a - b);
      expect(positions[0]).toBeCloseTo(-waterBedOffset, 10);
      expect(positions[1]).toBeCloseTo(0, 10);

      // The wet slab carries the per-tile animated water material (not a
      // shared standard material); the dry slab the seeded regolith.
      const water = meshes.find((m) => m.position.y < 0)!;
      expect((water.material as MeshStandardMaterial).type).toBe("MeshStandardMaterial");
    } finally {
      await renderer.unmount();
    }
  });

  it("shows the shared can-place tint instead of animated water when hovered and placeable", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(
      <WaterSurface
        gridX={gridX}
        gridZ={gridZ}
        canPlace
        isHovered
        onClick={() => {}}
      />
    );

    try {
      // Hovered + placeable: a single full-tile slab carrying the shared
      // can-place tint (no per-tile animated water while highlighted).
      const meshes = getMeshes(renderer);
      expect(meshes).toHaveLength(1);
      const tint = meshes[0].material as MeshStandardMaterial;
      expect(tint.emissiveIntensity).toBeGreaterThan(0);

      // A second hovered tile reuses the identical shared material instance.
      const renderer2 = await ReactThreeTestRenderer.create(
        <WaterSurface
          gridX={gridX + 1}
          gridZ={gridZ}
          canPlace
          isHovered
          onClick={() => {}}
        />
      );
      try {
        expect(getMeshes(renderer2)[0].material).toBe(tint);
      } finally {
        await renderer2.unmount();
      }
    } finally {
      await renderer.unmount();
    }
  });

  it("tints both halves of a partial variant on hover", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(
      <WaterSurface
        gridX={gridX}
        gridZ={gridZ}
        waterVariantCode={partialVariantCode}
        canPlace
        isHovered
        onClick={() => {}}
      />
    );

    try {
      const meshes = getMeshes(renderer);
      expect(meshes).toHaveLength(2);
      // Both halves carry a highlight tint (no animated water while the
      // whole tile is highlighted), so the tile reads as one unit.
      for (const m of meshes) {
        expect((m.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
      }
    } finally {
      await renderer.unmount();
    }
  });

  it("resolves editor hover from the store when the tile is the hovered one", async () => {
    setupStores();
    await ReactThreeTestRenderer.act(async () => {
      useLevelEditorStore.getState().setHoveredTile({ gridX, gridZ });
    });
    const renderer = await ReactThreeTestRenderer.create(
      <WaterSurface
        gridX={gridX}
        gridZ={gridZ}
        canPlace
        onHover={() => {}}
        onClick={() => {}}
      />
    );
    const rendererOther = await ReactThreeTestRenderer.create(
      <WaterSurface
        gridX={gridX + 1}
        gridZ={gridZ}
        canPlace
        onHover={() => {}}
        onClick={() => {}}
      />
    );

    try {
      // The hovered tile shows the tint; the neighbouring (unhovered) tile
      // keeps its per-tile animated water surface.
      const hovered = getMeshes(renderer)[0].material;
      const other = getMeshes(rendererOther)[0].material;
      expect(
        (hovered as MeshStandardMaterial).emissiveIntensity
      ).toBeGreaterThan(0);
      expect(other).not.toBe(hovered);
    } finally {
      await renderer.unmount();
      await rendererOther.unmount();
    }
  });

  it("keeps the idle water material tile-owned", async () => {
    setupStores();
    const renderer = await ReactThreeTestRenderer.create(
      <WaterSurface gridX={gridX} gridZ={gridZ} canPlace={false} onClick={() => {}} />
    );
    const renderer2 = await ReactThreeTestRenderer.create(
      <WaterSurface
        gridX={gridX + 1}
        gridZ={gridZ}
        canPlace={false}
        onClick={() => {}}
      />
    );

    try {
      const a = getMeshes(renderer)[0].material;
      const b = getMeshes(renderer2)[0].material;
      // Two idle water tiles: each owns its animated material instance (the
      // per-tile rippling surface is not shared).
      expect(a).not.toBe(b);
    } finally {
      await renderer.unmount();
      await renderer2.unmount();
    }
  });
});
