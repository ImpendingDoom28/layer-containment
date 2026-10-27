import { Shape, ShapeGeometry, type BufferGeometry } from "three";

import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils";

/**
 * Shared unit-size (1x1, centered on the origin) geometries for the enemy
 * upgrade glyphs. Each is a flat, solid outline shape built from `Shape` +
 * `ShapeGeometry`, so it stays readable from any angle inside a Billboard.
 * Built once at module load and shared by every enemy in the scene.
 *
 * - shield: classic kite shield — the "Armored" health pool
 * - heart: bezier heart — "Regenerating"
 * - bolt: lightning zig-zag — "Unstoppable" (slow resistance)
 * - wind swoosh: three tapered speed lines with rounded caps — "Swift"
 */

const buildShield = (): Shape => {
  const s = new Shape();
  s.moveTo(0, 0.5);
  s.lineTo(0.48, 0.38);
  s.quadraticCurveTo(0.48, 0.05, 0.42, -0.15);
  s.quadraticCurveTo(0.3, -0.38, 0, -0.5);
  s.quadraticCurveTo(-0.3, -0.38, -0.42, -0.15);
  s.quadraticCurveTo(-0.48, 0.05, -0.48, 0.38);
  s.lineTo(0, 0.5);
  return s;
};

const buildHeart = (): Shape => {
  const s = new Shape();
  s.moveTo(0, -0.45);
  s.bezierCurveTo(-0.5, -0.1, -0.45, 0.42, -0.2, 0.42);
  s.bezierCurveTo(-0.06, 0.42, 0, 0.32, 0, 0.22);
  s.bezierCurveTo(0, 0.32, 0.06, 0.42, 0.2, 0.42);
  s.bezierCurveTo(0.45, 0.42, 0.5, -0.1, 0, -0.45);
  return s;
};

const buildBolt = (): Shape => {
  const s = new Shape();
  s.moveTo(0.1, 0.5);
  s.lineTo(-0.28, -0.02);
  s.lineTo(0.02, -0.02);
  s.lineTo(-0.1, -0.5);
  s.lineTo(0.28, 0.02);
  s.lineTo(-0.02, 0.02);
  s.closePath();
  return s;
};

/** One tapered swoosh line: thin at the right (tail) end, rounded cap on the left. */
const buildWindLine = (
  y: number,
  width: number,
  thickness: number,
  cap: number
): Shape => {
  const s = new Shape();
  s.moveTo(-width / 2 + cap, y + thickness / 2);
  s.lineTo(width / 2, y);
  s.lineTo(-width / 2 + cap, y - thickness / 2);
  s.quadraticCurveTo(-width / 2, y, -width / 2 + cap, y + thickness / 2);
  return s;
};

const buildWindSwoosh = (): Shape[] => [
  buildWindLine(0.28, 0.9, 0.1, 0.05),
  buildWindLine(0.0, 0.66, 0.11, 0.05),
  buildWindLine(-0.28, 0.44, 0.1, 0.05),
];

const shapeToGeometry = (shape: Shape): BufferGeometry =>
  new ShapeGeometry(shape, 8);

export const UPGRADE_GLYPH_SHIELD_GEOMETRY: BufferGeometry =
  shapeToGeometry(buildShield());

export const UPGRADE_GLYPH_HEART_GEOMETRY: BufferGeometry =
  shapeToGeometry(buildHeart());

export const UPGRADE_GLYPH_BOLT_GEOMETRY: BufferGeometry =
  shapeToGeometry(buildBolt());

export const UPGRADE_GLYPH_WIND_GEOMETRY: BufferGeometry = mergeGeometries(
  buildWindSwoosh().map(shapeToGeometry)
)!;
