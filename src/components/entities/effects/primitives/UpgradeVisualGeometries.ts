import {
  ExtrudeGeometry,
  PlaneGeometry,
  RingGeometry,
  Shape,
  SphereGeometry,
  type BufferGeometry,
} from "three";

/**
 * Shared unit-size geometries for the physical enemy upgrade effects. All are
 * centered on the origin and scaled per enemy at the mesh level:
 *
 * - shield plate: the classic shield silhouette, extruded to a thin 3D plate —
 *   "Armored"
 * - glow shell: a unit sphere slightly larger than the body — "Unstoppable"
 * - regen ring: a flat ring on the ground, wider than the body, the emitter
 *   for the rising green energy — "Regenerating"
 * - strap plane: a 1x1 plane whose UVs fade toward the tail, re-oriented per
 *   frame so it trails behind the enemy along its travel direction — "Swift"
 */

const buildShieldShape = (): Shape => {
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

const extrudedShield = new ExtrudeGeometry(buildShieldShape(), {
  depth: 0.14,
  bevelEnabled: false,
});
extrudedShield.translate(0, 0, -0.07);

export const SHIELD_PLATE_GEOMETRY: BufferGeometry = extrudedShield;
export const GLOW_SHELL_GEOMETRY: BufferGeometry = new SphereGeometry(1, 10, 8);

// Annulus (not a filled disc) so the ring reads as a ring from the top-down
// camera: it is hidden where it sits under the body and only its outer band
// is visible. The outer radius (1.5) is wider than the body radius (1) so the
// ring clearly surrounds the enemy.
export const REGEN_RING_GEOMETRY: BufferGeometry = new RingGeometry(
  0.9,
  1.5,
  24
);
REGEN_RING_GEOMETRY.rotateX(-Math.PI / 2);

export const STRAP_PLANE_GEOMETRY: BufferGeometry = new PlaneGeometry(1, 1);
