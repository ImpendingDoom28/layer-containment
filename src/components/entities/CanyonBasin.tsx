import { FC, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
} from "three";

import {
  canyonsSelector,
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { tileSizeSelector, useGameStore } from "../../core/stores/useGameStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import {
  getBasinCapBBox,
  getCanyonWorldBBox,
  sampleBasinFloorY,
  type CanyonWorldBBox,
} from "../../utils/canyonBridges";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getCssColorValue } from "../ui/lib/cssUtils";

// Vertex grid resolution of the bowl: the floor is a smooth curve, so it needs
// enough vertices to round (a handful of quads could only tilt like a tile).
const GRID_SEGMENTS = 40;
// Skirt resolution along each perimeter edge: the wall follows the sphere's
// curvature, so it needs enough points to track the surface and the floor.
const SKIRT_SEGMENTS = 24;

const buildCapGrid = (
  capBBox: CanyonWorldBBox,
  canyonBBox: CanyonWorldBBox,
  radius: number
): { positions: number[]; indices: number[] } => {
  const positions: number[] = [];
  const cols = GRID_SEGMENTS + 1;
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < cols; i++) {
      const x =
        capBBox.minX + (i / GRID_SEGMENTS) * (capBBox.maxX - capBBox.minX);
      const z =
        capBBox.minZ + (j / GRID_SEGMENTS) * (capBBox.maxZ - capBBox.minZ);
      const y = sampleBasinFloorY(x, z, canyonBBox, radius);
      positions.push(x, y, z);
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < GRID_SEGMENTS; j++) {
    for (let i = 0; i < GRID_SEGMENTS; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, d, b, a, c, d);
    }
  }
  return { positions, indices };
};

// The perimeter of the canyon rectangle as an ordered, closed CCW loop (from
// above), sampled at SKIRT_SEGMENTS per edge. The first vertex of each edge is
// the corner; the last is the next corner, so consecutive samples are adjacent.
const buildPerimeter = (bbox: CanyonWorldBBox): Array<[number, number]> => {
  const out: Array<[number, number]> = [];
  const edge = (
    x0: number,
    z0: number,
    x1: number,
    z1: number
  ) => {
    for (let i = 0; i < SKIRT_SEGMENTS; i++) {
      const t = i / SKIRT_SEGMENTS;
      out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]);
    }
  };
  edge(bbox.minX, bbox.minZ, bbox.maxX, bbox.minZ); // south
  edge(bbox.maxX, bbox.minZ, bbox.maxX, bbox.maxZ); // east
  edge(bbox.maxX, bbox.maxZ, bbox.minX, bbox.maxZ); // north
  edge(bbox.minX, bbox.maxZ, bbox.minX, bbox.minZ); // west
  return out;
};

// The vertical cliff wall at the canyon's perimeter: for each perimeter sample
// a quad from the basin floor (full depth) up to the planet surface — the
// visible side of the bowl. Winding (from a CCW-perimeter, above) is outward;
// the material is DoubleSide so the inner face (seen from the floor) renders.
const buildSkirt = (
  bbox: CanyonWorldBBox,
  radius: number
): { positions: number[]; indices: number[] } => {
  const perimeter = buildPerimeter(bbox);
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < perimeter.length; i++) {
    const [x, z] = perimeter[i];
    const floorY = sampleBasinFloorY(x, z, bbox, radius);
    const { surfacePoint } = flatFieldToSphereSurface(x, z, radius);
    const bottom = positions.length / 3;
    positions.push(x, floorY, z); // bottom (on the floor)
    positions.push(x, surfacePoint.y, z); // top (at the surface)
    const nextBottom = positions.length / 3;
    const a = bottom;
    const b = bottom + 1; // top of current
    const c = nextBottom;
    const d = nextBottom + 1; // top of next
    // (a, b, d) + (a, d, c): outward-facing for a CCW perimeter.
    indices.push(a, b, d, a, d, c);
  }
  return { positions, indices };
};

const buildGeometry = (
  part: { positions: number[]; indices: number[] }
): BufferGeometry => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(part.positions, 3)
  );
  geometry.setIndex(part.indices);
  geometry.computeVertexNormals();
  return geometry;
};

/**
 * The carved basin bowl filling the hole cut in the ground sphere (see
 * `Ground`). Two meshes: the **bowl** (a fine grid over the canyon rectangle
 * plus its bank width, every vertex on `sampleBasinFloorY` — the planet
 * surface lowered to a flat bottom inside the canyon and eased back to the
 * surface over the bank) in a dark bedrock color, and the **cliff** (a
 * vertical wall at the perimeter dropping from the floor to the surface) in a
 * lighter rock color so the lit wall contrasts with the dark floor and reads
 * as depth from the shallow game camera. The bowl's sloped bank sits under the
 * neighboring land tiles (which sit flush over it), so the cap's rim and the
 * tiles share no coplanar band and the seam shows no gap and no z-fighting.
 */
export const CanyonBasin: FC = memo(() => {
  const canyons = useLevelStore(canyonsSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);

  const radius = getPlanetRadius(gridSize, tileSize);

  const canyonBBox = useMemo(
    () =>
      canyons.length === 0
        ? null
        : getCanyonWorldBBox(canyons, gridSize, tileSize),
    [canyons, gridSize, tileSize]
  );

  const bowlGeometry = useMemo(() => {
    if (!canyonBBox) return null;
    return buildGeometry(
      buildCapGrid(getBasinCapBBox(canyonBBox), canyonBBox, radius)
    );
  }, [canyonBBox, radius]);

  const cliffGeometry = useMemo(() => {
    if (!canyonBBox) return null;
    return buildGeometry(buildSkirt(canyonBBox, radius));
  }, [canyonBBox, radius]);

  const bowlMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: getCssColorValue("scene-canyon-floor"),
        roughness: 0.95,
        metalness: 0.02,
        side: DoubleSide,
      }),
    []
  );
  const cliffMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: getCssColorValue("scene-canyon-rock"),
        roughness: 0.9,
        metalness: 0.03,
        side: DoubleSide,
      }),
    []
  );

  useEffect(
    () => () => {
      bowlGeometry?.dispose();
    },
    [bowlGeometry]
  );
  useEffect(
    () => () => {
      cliffGeometry?.dispose();
    },
    [cliffGeometry]
  );
  useEffect(() => () => bowlMaterial.dispose(), [bowlMaterial]);
  useEffect(() => () => cliffMaterial.dispose(), [cliffMaterial]);

  const bowlRef = useRef<Mesh>(null);
  const cliffRef = useRef<Mesh>(null);
  useLayoutEffect(() => {
    if (bowlRef.current && bowlGeometry) freezeSubtree(bowlRef.current);
    if (cliffRef.current && cliffGeometry) freezeSubtree(cliffRef.current);
  }, [bowlGeometry, cliffGeometry]);

  if (!bowlGeometry || !cliffGeometry) return null;

  return (
    <>
      <mesh
        ref={bowlRef}
        name="canyon-basin"
        geometry={bowlGeometry}
        material={bowlMaterial}
        castShadow
        receiveShadow
      />
      <mesh
        ref={cliffRef}
        name="canyon-basin-cliff"
        geometry={cliffGeometry}
        material={cliffMaterial}
        castShadow
        receiveShadow
      />
    </>
  );
});

CanyonBasin.displayName = "CanyonBasin";
