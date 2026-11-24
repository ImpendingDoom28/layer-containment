import { BufferGeometry, Float32BufferAttribute } from "three";

import type { WaterVariant } from "../core/types/game";

type Vec2 = [number, number];

/**
 * Partial-tile water/land slab geometry for the 9-tile water scheme.
 *
 * A water tile whose `variant` is not `full` is drawn as two slabs that
 * partition the tile: a recessed animated *water* slab over the water
 * footprint, and a shore-level *land* slab (regolith) over the complement.
 * Both slabs are centered on the tile origin (the same pose as the full-tile
 * box), so they sit in the same 0.05 basin and share the same shore plane.
 *
 * Footprints are defined in tile-local 2D coordinates `u` (east) and `v`
 * (north), in the range `[-tileSize/2, tileSize/2]`, and mapped to three.js
 * local space by `x = u`, `z = -v` (north = -z), which matches the tile pose
 * (local +x = east, local +z = south). Slabs are extruded along local Y (the
 * tile's radial normal) so they follow the planet surface.
 *
 * The water slab's top face is subdivided on an 8x8 grid (like the full-tile
 * box) so the vertex-displacement swell has vertices to move; the land slab's
 * top face is a flat fan (the regolith material is per-fragment and needs no
 * displacement). All faces are non-indexed with flat normals.
 */

type PartialVariant = Exclude<WaterVariant, "full">;

// Water footprint (the wet half) for each partial variant, CCW in (u, v).
const waterFootprint = (variant: PartialVariant, a: number): Vec2[] => {
  switch (variant) {
    case "half-n":
      return [[-a, 0], [a, 0], [a, a], [-a, a]];
    case "half-s":
      return [[-a, -a], [a, -a], [a, 0], [-a, 0]];
    case "half-e":
      return [[0, -a], [a, -a], [a, a], [0, a]];
    case "half-w":
      return [[-a, -a], [0, -a], [0, a], [-a, a]];
    case "corner-nw":
      return [[-a, a], [-a, -a], [a, a]];
    case "corner-ne":
      return [[a, a], [-a, a], [a, -a]];
    case "corner-se":
      return [[a, -a], [a, a], [-a, -a]];
    case "corner-sw":
      return [[-a, -a], [a, -a], [-a, a]];
  }
};

// Land footprint (the dry half, the complement of the water footprint), CCW.
const landFootprint = (variant: PartialVariant, a: number): Vec2[] => {
  switch (variant) {
    case "half-n":
      return [[-a, -a], [a, -a], [a, 0], [-a, 0]];
    case "half-s":
      return [[-a, 0], [a, 0], [a, a], [-a, a]];
    case "half-e":
      return [[-a, -a], [0, -a], [0, a], [-a, a]];
    case "half-w":
      return [[0, -a], [a, -a], [a, a], [0, a]];
    case "corner-nw":
      return [[a, -a], [a, a], [-a, -a]];
    case "corner-ne":
      return [[-a, -a], [a, -a], [-a, a]];
    case "corner-se":
      return [[-a, a], [-a, -a], [a, a]];
    case "corner-sw":
      return [[a, a], [-a, a], [a, -a]];
  }
};

const cross2 = (ax: number, ay: number, bx: number, by: number): number =>
  ax * by - ay * bx;

const lineIntersect = (p: Vec2, q: Vec2, a: Vec2, b: Vec2): Vec2 => {
  const denom = cross2(q[0] - p[0], q[1] - p[1], b[0] - a[0], b[1] - a[1]);
  const s =
    cross2(a[0] - p[0], a[1] - p[1], b[0] - a[0], b[1] - a[1]) / denom;
  return [p[0] + s * (q[0] - p[0]), p[1] + s * (q[1] - p[1])];
};

// Sutherland–Hodgman: clip a convex subject polygon against a convex CCW clip
// polygon, returning their (convex) intersection.
const clipConvex = (subject: Vec2[], clip: Vec2[]): Vec2[] => {
  let output = subject;
  for (let i = 0; i < clip.length; i += 1) {
    const a = clip[i];
    const b = clip[(i + 1) % clip.length];
    const input = output;
    output = [];
    for (let j = 0; j < input.length; j += 1) {
      const current = input[j];
      const previous = input[(j + input.length - 1) % input.length];
      const currentInside =
        cross2(b[0] - a[0], b[1] - a[1], current[0] - a[0], current[1] - a[1]) >=
        0;
      const previousInside =
        cross2(b[0] - a[0], b[1] - a[1], previous[0] - a[0], previous[1] - a[1]) >=
        0;
      if (currentInside && previousInside) {
        output.push(current);
      } else if (currentInside && !previousInside) {
        output.push(lineIntersect(previous, current, a, b), current);
      } else if (!currentInside && previousInside) {
        output.push(lineIntersect(previous, current, a, b));
      }
    }
  }
  return output;
};

const pushTri = (
  positions: number[],
  p: Vec2,
  q: Vec2,
  r: Vec2,
  y: number
) => {
  positions.push(p[0], y, -p[1]);
  positions.push(q[0], y, -q[1]);
  positions.push(r[0], y, -r[1]);
};

/**
 * Build a non-indexed slab for a CCW footprint (in tile-local u/v): a
 * grid-clipped top face when `subdivided` (water), a flat fan otherwise
 * (land), a fan bottom, and vertical side walls. Centered on the origin; top
 * at +halfH, bottom at -halfH.
 */
const buildSlabGeometry = (
  footprint: Vec2[],
  tileSize: number,
  halfH: number,
  subdivided: boolean
): BufferGeometry => {
  const a = tileSize / 2;
  const positions: number[] = [];

  if (subdivided) {
    const n = 8;
    const cell = (2 * a) / n;
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        const u0 = -a + i * cell;
        const v0 = -a + j * cell;
        const u1 = u0 + cell;
        const v1 = v0 + cell;
        const clipped = clipConvex(
          [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1],
          ],
          footprint
        );
        for (let k = 1; k < clipped.length - 1; k += 1) {
          pushTri(positions, clipped[0], clipped[k], clipped[k + 1], halfH);
        }
      }
    }
  } else {
    for (let k = 1; k < footprint.length - 1; k += 1) {
      pushTri(positions, footprint[0], footprint[k], footprint[k + 1], halfH);
    }
  }

  // Bottom face (fan, reversed winding so the normal points down).
  for (let k = 1; k < footprint.length - 1; k += 1) {
    pushTri(positions, footprint[0], footprint[k + 1], footprint[k], -halfH);
  }

  // Side walls: two outward triangles per footprint edge, from bottom to top.
  for (let i = 0; i < footprint.length; i += 1) {
    const p0 = footprint[i];
    const p1 = footprint[(i + 1) % footprint.length];
    const ax = p0[0];
    const az = -p0[1];
    const bx = p1[0];
    const bz = -p1[1];
    // Triangle 1: (p0-bottom, p1-bottom, p1-top) — normal outward along the edge.
    positions.push(ax, -halfH, az, bx, -halfH, bz, bx, halfH, bz);
    // Triangle 2: (p0-bottom, p1-top, p0-top).
    positions.push(ax, -halfH, az, bx, halfH, bz, ax, halfH, az);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
};

// One geometry per (variant, size), shared across every tile of a level.
const waterSlabCache = new Map<string, BufferGeometry>();
const landSlabCache = new Map<string, BufferGeometry>();

const getWaterVariantSlab = (
  variant: PartialVariant,
  tileSize: number,
  halfH: number
): BufferGeometry => {
  const key = `water|${variant}|${tileSize}x${halfH}`;
  const entry = waterSlabCache.get(key);
  if (entry) return entry;
  const geometry = buildSlabGeometry(
    waterFootprint(variant, tileSize / 2),
    tileSize,
    halfH,
    true
  );
  waterSlabCache.set(key, geometry);
  return geometry;
};

const getLandVariantSlab = (
  variant: PartialVariant,
  tileSize: number,
  halfH: number
): BufferGeometry => {
  const key = `land|${variant}|${tileSize}x${halfH}`;
  const entry = landSlabCache.get(key);
  if (entry) return entry;
  const geometry = buildSlabGeometry(
    landFootprint(variant, tileSize / 2),
    tileSize,
    halfH,
    false
  );
  landSlabCache.set(key, geometry);
  return geometry;
};

export type WaterVariantSlabs = {
  /** The wet-half slab (subdivided top) for partial variants; null for `full`. */
  water: BufferGeometry | null;
  /** The dry-half slab for partial variants; null for `full`. */
  land: BufferGeometry | null;
};

/**
 * Resolve the slabs a water tile needs. `full` keeps the existing full-tile box
 * (handled by the caller) and yields no partial slabs; a partial variant yields
 * a water slab (the wet half) plus a land slab (the dry half).
 */
export const getWaterVariantSlabs = (
  variant: WaterVariant,
  tileSize: number,
  halfH: number
): WaterVariantSlabs => {
  if (variant === "full") return { water: null, land: null };
  return {
    water: getWaterVariantSlab(variant, tileSize, halfH),
    land: getLandVariantSlab(variant, tileSize, halfH),
  };
};
