import { MeshStandardMaterial, SphereGeometry, TorusGeometry } from "three";
import type { BufferGeometry, Material } from "three";

// Fixed-argument geometries for the short-lived effect primitives (burst
// rings, orbiting particles). They never change size at runtime, so one
// module-level instance each is shared across every effect instance instead
// of allocating a buffer per enemy or per burst.

export const PARTICLE_SPHERE_05_GEOMETRY: BufferGeometry = new SphereGeometry(0.05, 8, 8);
export const PARTICLE_SPHERE_04_GEOMETRY: BufferGeometry = new SphereGeometry(0.04, 8, 8);
export const REGEN_PARTICLE_SPHERE_GEOMETRY: BufferGeometry = new SphereGeometry(0.06, 8, 8);
export const EFFECT_TORUS_OUTER_GEOMETRY: BufferGeometry = new TorusGeometry(0.3, 0.05, 8, 32);
export const EFFECT_TORUS_INNER_GEOMETRY: BufferGeometry = new TorusGeometry(0.25, 0.03, 8, 32);
export const SLOW_TORUS_GEOMETRY: BufferGeometry = new TorusGeometry(1, 0.024, 8, 32);
export const MEDIC_BURST_RING1_GEOMETRY: BufferGeometry = new TorusGeometry(1, 0.06, 8, 32);
export const MEDIC_BURST_RING2_GEOMETRY: BufferGeometry = new TorusGeometry(0.88, 0.04, 8, 32);

// Shared (color, emissiveIntensity, base opacity) materials for the short-lived
// effect particles, keyed per color (the effect's colour is its only axis of
// variation). `transparent` starts true so the shared material's state is
// constant; `opacity` is driven per frame and must never be read back.
const particleMaterialCache = new Map<string, MeshStandardMaterial>();
export const getParticleMaterial = (
  color: string,
  emissiveIntensity: number,
  opacity: number
): MeshStandardMaterial => {
  const key = `${color}|${emissiveIntensity}|${opacity}`;
  let material = particleMaterialCache.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      transparent: true,
      opacity,
    });
    particleMaterialCache.set(key, material);
  }
  return material;
};

// Medic burst ring 1: identical colour/emissive for every medic, so one
// shared instance. Ring 2 is the medic's own colour, so it stays per instance.
let medicRing1Material: Material | null = null;
export const getMedicRing1Material = (color: string): Material => {
  if (!medicRing1Material) {
    medicRing1Material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0,
    });
  }
  return medicRing1Material;
};
