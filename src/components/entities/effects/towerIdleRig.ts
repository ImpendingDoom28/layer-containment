import { MeshStandardMaterial, type Mesh, type Object3D } from "three";

import type { Tower as TowerInstance } from "../../../core/types/game";
import { FRUSTUM_CULL_SNAPSHOT_EXCLUDE } from "../../../utils/frustumCulling";

// Idle motion tuning. Everything is a slow sine on the pause-aware
// simulation clock with a per-tower phase offset, so the board reads as
// inhabited without any two towers moving in lockstep, and freezes with the
// world on pause / time dilation.
//
// Scan: the top piece (the aiming turret, or the relay's pulse array)
// sweeps ±SCAN_AMPLITUDE around its held aim at SCAN_SPEED — a full sweep
// takes ~18 s. The scan fades in over SCAN_FADE_IN after the tower goes
// idle so a turret that just lost its target does not snap sideways, and it
// is timed from the moment the tower goes idle, so a freshly-idle tower
// always starts its sweep from the middle (the held yaw), never from an
// end of the swing.
const SCAN_AMPLITUDE = 0.28;
const SCAN_SPEED = 0.35;
const SCAN_FADE_IN = 1.2;
// Bob: the top piece floats ±BOB_WORLD_AMPLITUDE (world units, converted to
// the node's model-local units at registration) at BOB_SPEED (~6 s period).
const BOB_WORLD_AMPLITUDE = 0.01;
const BOB_SPEED = 1.1;
// Breathing: the tower's emissive "energy" material pulses ±BREATH_AMPLITUDE
// around its rest intensity (~7 s period).
const BREATH_AMPLITUDE = 0.25;
const BREATH_SPEED = 0.9;

// Per-tower phase offset: tower ids hashed by the golden angle, so
// neighbouring towers (consecutive ids) sit at well-separated phases.
const phaseForTower = (towerId: number): number =>
  (towerId * 2.399963229728653) % (Math.PI * 2);

type IdleEmissive = {
  material: MeshStandardMaterial;
  /** The material's rest emissive intensity the breathing oscillates around. */
  base: number;
};

export type TowerIdleRig = {
  towerId: number;
  /**
   * The animated top piece: the aiming turret node for combat towers (the
   * sim owns its yaw while a target is live; the idle scan only drives it
   * when the tower has no target), or the decorative top node for the relay.
   * `null` for a model without one — the emissive breathing still runs.
   */
  topNode: Object3D | null;
  /** The top node's rest local Y, captured at registration. */
  restY: number;
  /** Bob amplitude in the top node's local units (world amplitude / model fit scale). */
  bobAmplitude: number;
  /** Per-tower clones of the model's emissive materials. */
  emissives: IdleEmissive[];
  phase: number;
  /** The turret yaw the scan oscillates around (tracks the sim's last aim). */
  heldYaw: number;
  /** Simulation time the tower went idle (drives the scan fade-in). */
  idleSince: number | null;
};

// The live idle rigs, keyed by tower id. Towers register on model load and
// unregister on unmount; the shared `TowerIdleAnimation` driver iterates
// this map from a single `useFrame`.
const idleRigs = new Map<number, TowerIdleRig>();

export const getTowerIdleRigs = (): ReadonlyMap<number, TowerIdleRig> =>
  idleRigs;

/**
 * Clones the model's emissive-bearing materials (the per-type "energy"
 * accents) so each placed tower breathes on its own phase without touching
 * the GLTF materials shared by every tower of a type. The clones share the
 * compiled shader program with the originals, so the cost is one material
 * instance per tower, not one shader compile. Meshes sharing one material
 * inside the model keep sharing the single per-tower clone.
 */
const cloneEmissiveMaterials = (root: Object3D): IdleEmissive[] => {
  const clones = new Map<MeshStandardMaterial, MeshStandardMaterial>();
  root.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    const remapped = materials.map((material) => {
      if (
        !(material instanceof MeshStandardMaterial) ||
        (material.emissive.r === 0 &&
          material.emissive.g === 0 &&
          material.emissive.b === 0)
      ) {
        return material;
      }
      let clone = clones.get(material);
      if (!clone) {
        clone = material.clone();
        clones.set(material, clone);
      }
      return clone;
    });
    mesh.material = Array.isArray(mesh.material) ? remapped : remapped[0];
  });
  return [...clones.values()].map((material) => ({
    material,
    base: material.emissiveIntensity,
  }));
};

/**
 * Registers a placed tower for idle animation and returns the unregister
 * callback (which also disposes the per-tower emissive material clones).
 * The top piece is the firing turret node when the model has one, else the
 * config's decorative `idleNode` (the relay's pulse array); with neither,
 * only the emissive breathing runs.
 */
export const registerTowerIdleAnimation = (
  tower: TowerInstance,
  modelGroup: Object3D
): (() => void) => {
  unregisterTowerIdleAnimation(tower.id);
  const topNodeName = tower.muzzle?.turretNode ?? tower.idleNode;
  const topNode = topNodeName
    ? modelGroup.getObjectByName(topNodeName) ?? null
    : null;
  // The idle bob/scan (and the firing recoil under the same node) move this
  // subtree every frame; excluding it from the culling staleness snapshot
  // keeps the frustum-culling bounding-sphere re-measure from running every
  // frame. The displacement is centimeters, far inside the culling margin.
  if (topNode) topNode.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE] = true;
  const modelScale = modelGroup.scale.x || 1;
  const rig: TowerIdleRig = {
    towerId: tower.id,
    topNode,
    restY: topNode?.position.y ?? 0,
    bobAmplitude: BOB_WORLD_AMPLITUDE / modelScale,
    emissives: cloneEmissiveMaterials(modelGroup),
    phase: phaseForTower(tower.id),
    heldYaw: topNode?.rotation.y ?? 0,
    idleSince: null,
  };
  idleRigs.set(tower.id, rig);
  return () => unregisterTowerIdleAnimation(tower.id);
};

export const unregisterTowerIdleAnimation = (towerId: number): void => {
  const rig = idleRigs.get(towerId);
  if (!rig) return;
  idleRigs.delete(towerId);
  if (rig.topNode) {
    // Restore the animated baseline before cleanup so a later re-registration
    // (e.g. the tower's model being re-fitted) captures the model's rest pose
    // instead of a mid-scan / mid-bob pose.
    rig.topNode.position.y = rig.restY;
    delete rig.topNode.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE];
  }
  for (const { material, base } of rig.emissives) {
    material.emissiveIntensity = base;
    material.dispose();
  }
};

/**
 * Advances one tower's idle motion to `simTime` (the pause-aware simulation
 * clock, so a frozen clock freezes every motion mid-pose). While the sim's
 * aim pass owns the turret (`isAiming`) the scan leaves the yaw alone and
 * just tracks it; the bob and the emissive breathing always run.
 * `reducedMotion` restores the rest pose instead of animating.
 */
export const updateTowerIdleRig = (
  rig: TowerIdleRig,
  simTime: number,
  isAiming: boolean,
  reducedMotion: boolean
): void => {
  const { topNode } = rig;
  if (reducedMotion) {
    if (topNode) {
      topNode.position.y = rig.restY;
      if (!isAiming) topNode.rotation.y = rig.heldYaw;
    }
    for (const { material, base } of rig.emissives) {
      material.emissiveIntensity = base;
    }
    rig.idleSince = null;
    return;
  }

  const breath =
    1 + BREATH_AMPLITUDE * Math.sin(BREATH_SPEED * simTime + rig.phase);
  for (const { material, base } of rig.emissives) {
    material.emissiveIntensity = base * breath;
  }

  if (!topNode) return;
  topNode.position.y =
    rig.restY + rig.bobAmplitude * Math.sin(BOB_SPEED * simTime + rig.phase);

  if (isAiming) {
    rig.heldYaw = topNode.rotation.y;
    rig.idleSince = null;
    return;
  }
  if (rig.idleSince === null) rig.idleSince = simTime;
  const fadeIn = Math.min(1, (simTime - rig.idleSince) / SCAN_FADE_IN);
  // The sweep is timed from the moment the tower went idle, so the scan
  // starts from the middle of its range (the held yaw) rather than an
  // arbitrary point on the wave — a tower that just finished aiming or was
  // just placed eases out from the center. Towers still desync because they
  // go idle at different simulation times (no per-tower phase needed here).
  topNode.rotation.y =
    rig.heldYaw +
    SCAN_AMPLITUDE *
      fadeIn *
      Math.sin(SCAN_SPEED * (simTime - rig.idleSince));
};
