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

const SPHERE_WIDTH_SEGMENTS = 100;
const SPHERE_HEIGHT_SEGMENTS = 100;

/**
 * The sphere is only ever cut where a basin needs to be: the pole-cap fan
 * (the first `widthSegments` triangles — the pole vertex plus the first
 * ring, the only triangles over the board) is clipped against the basin cap
 * rectangle and the carved bowl (see `CanyonBasin`) fills the hole. The rest
 * of the sphere is untouched. The clip rectangle is the basin cap's span
 * (`getBasinCapBBox`), so the hole's rim and the cap's rim share one edge:
 * the cap's rim band (under the neighboring land tiles) covers the fan's
 * faceted cut edge — the cone sagging slightly below the analytic sphere —
 * so the seam shows no gap and no sliver.
 */
type CutPoint = { x: number; y: number; z: number };

type Bound = { axis: "x" | "z"; value: number };

const clipConvex = (
  poly: CutPoint[],
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): CutPoint[] => {
  const bounds: Bound[] = [
    { axis: "x", value: minX },
    { axis: "x", value: maxX },
    { axis: "z", value: minZ },
    { axis: "z", value: maxZ },
  ];
  const inside = (p: CutPoint) =>
    p.x >= minX && p.x <= maxX && p.z >= minZ && p.z <= maxZ;
  // The t along the prev→cur segment where it crosses a bound, or null.
  const crossT = (prev: CutPoint, cur: CutPoint, bound: Bound): number | null => {
    const a = prev[bound.axis] - bound.value;
    const b = cur[bound.axis] - bound.value;
    if (a * b >= 0) return null;
    return (bound.value - prev[bound.axis]) / (cur[bound.axis] - prev[bound.axis]);
  };
  // The exact boundary point of a segment leaving (min t — the first
  // constraint violated) or entering (max t — the last constraint satisfied)
  // the rectangle.
  const boundaryPoint = (
    prev: CutPoint,
    cur: CutPoint,
    exiting: boolean
  ): CutPoint | null => {
    const ts = bounds
      .map((bound) => crossT(prev, cur, bound))
      .filter((t): t is number => t !== null);
    if (ts.length === 0) return null;
    const t = exiting ? Math.min(...ts) : Math.max(...ts);
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
    if (prevIn && curIn) {
      out.push(cur);
    } else if (prevIn) {
      const pt = boundaryPoint(prev, cur, true);
      if (pt) out.push(pt);
    } else if (curIn) {
      const pt = boundaryPoint(prev, cur, false);
      if (pt) out.push(pt);
      out.push(cur);
    }
  }
  return out;
};

const cutSphereAtCanyon = (
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

  const widthSegments = source.parameters.widthSegments;
  const firstTriangleEnd = widthSegments * 3;

  // Every triangle after the fan (its smallest vertex is in the second ring
  // and beyond) keeps its original indices.
  for (let i = firstTriangleEnd; i < sourceIndex.count; i++) {
    index.push(sourceIndex.getX(i));
  }

  const fanIndex = sourceIndex.array.slice(0, firstTriangleEnd);
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

  for (let t = 0; t < widthSegments; t++) {
    const [pole, r0, r1] = Array.from(
      fanIndex.slice(t * 3, t * 3 + 3)
    ).sort((p, q) => p - q) as [number, number, number];
    const p: CutPoint = {
      x: position.getX(pole),
      y: position.getY(pole),
      z: position.getZ(pole),
    };
    const q0: CutPoint = {
      x: position.getX(r0),
      y: position.getY(r0),
      z: position.getZ(r0),
    };
    const q1: CutPoint = {
      x: position.getX(r1),
      y: position.getY(r1),
      z: position.getZ(r1),
    };

    const poly: CutPoint[] = clipConvex([p, q0, q1], minX, maxX, minZ, maxZ);
    if (poly.length < 3) continue;

    // Reuse the fan's existing vertices for points that coincide with the
    // pole or a ring endpoint — no duplicate coincident vertices.
    const used = new Set<number>();
    const vertexFor = (pt: CutPoint): number => {
      for (const v of [r0, r1, pole]) {
        if (used.has(v)) continue;
        const same =
          Math.abs(pt.x - position.getX(v)) < 1e-6 &&
          Math.abs(pt.y - position.getY(v)) < 1e-6 &&
          Math.abs(pt.z - position.getZ(v)) < 1e-6;
        if (same) {
          used.add(v);
          return v;
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

export const Ground: FC = memo(() => {
  const gridSize = useLevelStore(gridSizeSelector);
  const canyons = useLevelStore(canyonsSelector);
  const tileSize = useGameStore(tileSizeSelector);

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
});

Ground.displayName = "Ground";
