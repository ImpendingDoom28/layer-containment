import { FC, memo, useEffect, useLayoutEffect, useMemo, useRef } from "react";

import {
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from "three";

import {
  canyonsSelector,
  gridSizeSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import {
  getPlanetRadius,
  getPlanetSphereMeshPositionY,
} from "../../../utils/planetSurfaceMapping";
import {
  getBasinCapBBox,
  getCanyonWorldBBox,
} from "../../../utils/canyonBridges";
import { freezeSubtree } from "../../../utils/freezeSubtree";
import { getCssColorValue } from "../../ui/lib/cssUtils";
import type { CanyonConfig } from "../../../core/types/game";

const SPHERE_WIDTH_SEGMENTS = 100;
const SPHERE_HEIGHT_SEGMENTS = 100;

/**
 * The sphere is cut where a basin needs to be: every triangle whose bounding
 * box overlaps the basin cap's XZ rectangle is clipped against that
 * rectangle, keeping only the portion OUTSIDE the cap — the ground over the
 * basin is cut away and the carved bowl (see `CanyonBasin`) fills the hole.
 * Clipping only the pole-cap fan (the first ring) is not enough, because an
 * edge canyon extends beyond that ring: a later triangle over the basin would
 * otherwise be left in place and hide the basin floor. The clip rectangle is
 * the basin cap's span (`getBasinCapBBox`), so the hole's rim and the cap's
 * rim share one edge: the cap's rim band (under the neighboring land tiles)
 * covers the faceted cut edge — the cone sagging slightly below the analytic
 * sphere — so the seam shows no gap and no sliver.
 */
type CutPoint = { x: number; y: number; z: number };

type HalfPlane = { axis: "x" | "z"; keepMin: boolean; value: number };

// Sutherland–Hodgman clip of a convex polygon against one axis-aligned
// half-plane. `keepMin` keeps the `axis <= value` side, otherwise the
// `axis >= value` side. Output preserves the input's winding.
const clipHalfPlane = (poly: CutPoint[], plane: HalfPlane): CutPoint[] => {
  if (poly.length === 0) return [];
  const inside = (pt: CutPoint) =>
    plane.keepMin
      ? pt[plane.axis] <= plane.value
      : pt[plane.axis] >= plane.value;
  // The exact point where the prev→cur segment crosses the half-plane.
  const cross = (prev: CutPoint, cur: CutPoint): CutPoint => {
    const a = prev[plane.axis] - plane.value;
    const b = cur[plane.axis] - plane.value;
    const t = a / (a - b);
    return {
      x: prev.x + t * (cur.x - prev.x),
      y: prev.y + t * (cur.y - prev.y),
      z: prev.z + t * (cur.z - prev.z),
    };
  };
  const out: CutPoint[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(cross(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(cross(prev, cur));
    }
  }
  return out;
};

const clipRegion = (poly: CutPoint[], planes: HalfPlane[]): CutPoint[] =>
  planes.reduce((acc, plane) => clipHalfPlane(acc, plane), poly);

// Twice the signed xz-area of a polygon; ~0 for degenerate (coincident)
// results of a clip where a corner lands exactly on the cap boundary.
const polygonArea2 = (poly: CutPoint[]): number => {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    area += a.x * b.z - b.x * a.z;
  }
  return area;
};

// The outside of the cap rectangle, partitioned into four disjoint, convex
// half-plane regions (each is the intersection of a few half-planes). Their
// union is exactly `outside the cap` — the ground we keep — while the cap
// interior (the basin hole) is dropped.
const outsideRegionPlanes = (
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): HalfPlane[][] => [
  [{ axis: "x", keepMin: true, value: minX }], // left of the cap
  [{ axis: "x", keepMin: false, value: maxX }], // right of the cap
  [
    { axis: "z", keepMin: true, value: minZ }, // bottom band
    { axis: "x", keepMin: false, value: minX },
    { axis: "x", keepMin: true, value: maxX },
  ],
  [
    { axis: "z", keepMin: false, value: maxZ }, // top band
    { axis: "x", keepMin: false, value: minX },
    { axis: "x", keepMin: true, value: maxX },
  ],
];

// Clip one triangle against the cap: keep the portion OUTSIDE the cap
// rectangle (the ground), drop the interior (the basin hole). A triangle
// wholly inside the cap contributes nothing; one wholly outside survives
// unchanged. `sourceVerts` is parallel to `vertices` (its k-th entry is the
// source index of `vertices[k]`); a clip point that coincides with one of the
// triangle's own corners reuses that source vertex — no coincident duplicates.
const clipTriangle = (
  vertices: Array<{ x: number; y: number; z: number }>,
  sourceVerts: number[],
  planes: HalfPlane[][],
  index: number[],
  nextVertex: (pt: CutPoint) => number
): void => {
  for (const plane of planes) {
    const poly = clipRegion(vertices, plane);
    if (poly.length < 3 || Math.abs(polygonArea2(poly)) < 1e-9) continue;

    const used = new Set<number>();
    const vertexFor = (pt: CutPoint): number => {
      for (let k = 0; k < vertices.length; k++) {
        if (used.has(sourceVerts[k])) continue;
        const same =
          Math.abs(pt.x - vertices[k].x) < 1e-6 &&
          Math.abs(pt.y - vertices[k].y) < 1e-6 &&
          Math.abs(pt.z - vertices[k].z) < 1e-6;
        if (same) {
          used.add(sourceVerts[k]);
          return sourceVerts[k];
        }
      }
      return nextVertex(pt);
    };

    // Fan-triangulate the clipped polygon (convex) from its first vertex.
    const ids = poly.map(vertexFor);
    for (let i = 1; i < ids.length - 1; i++) {
      const a = ids[0];
      const b = ids[i];
      const c = ids[i + 1];
      if (a === b || b === c || a === c) continue;
      index.push(a, b, c);
    }
  }
};

export const cutSphereAtCanyon = (
  source: SphereGeometry,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): BufferGeometry => {
  const geometry = source.clone();
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const sourceIndex = source.getIndex()!;
  const index: number[] = [];

  const vertexCount = position.count;
  const cutPositions: number[] = [];
  const cutNormals: number[] = [];
  const nextVertex = (pt: CutPoint): number => {
    const v = vertexCount + cutPositions.length / 3;
    cutPositions.push(pt.x, pt.y, pt.z);
    const len = Math.hypot(pt.x, pt.y, pt.z);
    cutNormals.push(pt.x / len, pt.y / len, pt.z / len);
    return v;
  };

  const vertex = (i: number) => ({
    x: position.getX(i),
    y: position.getY(i),
    z: position.getZ(i),
  });
  const planes = outsideRegionPlanes(minX, maxX, minZ, maxZ);

  // Every source triangle is considered in order (so the index buffer keeps
  // the sphere's winding and ordering). A triangle whose bounding box does not
  // overlap the cap's XZ rectangle — which includes everything on the far side
  // of the sphere — is kept untouched; only triangles near the cap (the board)
  // are clipped. This is what removes ground over an edge canyon that lies
  // partly beyond the pole fan's first ring, where clipping only the fan would
  // leave an overhang.
  const srcIndex = sourceIndex.array;
  for (let i = 0; i + 2 < srcIndex.length; i += 3) {
    const v0 = srcIndex[i];
    const v1 = srcIndex[i + 1];
    const v2 = srcIndex[i + 2];
    const p = vertex(v0);
    const q0 = vertex(v1);
    const q1 = vertex(v2);

    // Bounding-box quick reject: no overlap with the cap's XZ rectangle means
    // the triangle is clear of the basin and needs no clipping.
    const minXTri = Math.min(p.x, q0.x, q1.x);
    const maxXTri = Math.max(p.x, q0.x, q1.x);
    const minZTri = Math.min(p.z, q0.z, q1.z);
    const maxZTri = Math.max(p.z, q0.z, q1.z);
    const overlapsCapX = minXTri <= maxX && maxXTri >= minX;
    const overlapsCapZ = minZTri <= maxZ && maxZTri >= minZ;
    // Only the board (a small cap around the north pole) is ever cut. The
    // basin cap's xz footprint also covers the opposite (south) pole, so
    // require the triangle to be on the north-pole side (y > 0) — otherwise
    // the clip would carve a matching hole through the far side of the planet.
    const minY = Math.min(p.y, q0.y, q1.y);
    if (!overlapsCapX || !overlapsCapZ || minY <= 0) {
      index.push(v0, v1, v2);
      continue;
    }

    clipTriangle([p, q0, q1], [v0, v1, v2], planes, index, nextVertex);
  }

  geometry.setIndex(index);
  // The clone's bounds describe the uncut sphere; drop them so the renderer
  // recomputes them from the cut positions (frustum culling, raycasts).
  geometry.boundingSphere = null;
  geometry.boundingBox = null;
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(
      new Float32Array([
        ...(position.array as Float32Array),
        ...cutPositions,
      ]),
      3
    )
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute(
      new Float32Array([...(normal.array as Float32Array), ...cutNormals]),
      3
    )
  );
  return geometry;
};

export type GroundProps = {
  /** The board size; defaults to the published level. The editor passes its
      draft grid so the sphere matches the level being built. */
  gridSize?: number;
  /** The canyon cells that cut the basin hole in the sphere; defaults to the
      published level. */
  canyons?: CanyonConfig[];
};

export const Ground: FC<GroundProps> = memo(
  ({ gridSize: gridSizeProp, canyons: canyonsProp }: GroundProps) => {
    const storeGridSize = useLevelStore(gridSizeSelector);
    const storeCanyons = useLevelStore(canyonsSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const gridSize = gridSizeProp ?? storeGridSize;
    const canyons = canyonsProp ?? storeCanyons;

  const radius = getPlanetRadius(gridSize, tileSize);

  const bbox = useMemo(
    () =>
      canyons.length === 0
        ? null
        : getCanyonWorldBBox(canyons, gridSize, tileSize),
    [canyons, gridSize, tileSize]
  );

  const baseGeometry = useMemo(
    () =>
      new SphereGeometry(radius, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS),
    [radius]
  );

  const geometry = useMemo(() => {
    if (!bbox) return baseGeometry;
    const cap = getBasinCapBBox(bbox);
    return cutSphereAtCanyon(
      baseGeometry,
      cap.minX,
      cap.maxX,
      cap.minZ,
      cap.maxZ
    );
  }, [baseGeometry, bbox]);

  const material = useMemo(() => {
    return new MeshStandardMaterial({
      color: getCssColorValue("scene-gray-700"),
      metalness: 0.08,
      roughness: 0.9,
    });
  }, []);

  const meshRef = useRef<Mesh>(null);
  useLayoutEffect(() => {
    if (meshRef.current) freezeSubtree(meshRef.current);
  }, [geometry]);

  useEffect(() => {
    return () => baseGeometry.dispose();
  }, [baseGeometry]);

  useEffect(() => {
    if (geometry === baseGeometry) return;
    return () => geometry.dispose();
  }, [geometry, baseGeometry]);

  return (
    <mesh
      ref={meshRef}
      name="ground"
      geometry={geometry}
      material={material}
      position={[0, getPlanetSphereMeshPositionY(radius), 0]}
      receiveShadow
    />
  );
  }
);

Ground.displayName = "Ground";
