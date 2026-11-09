import type { Object3D } from "three";

import { FRUSTUM_CULL_SNAPSHOT_EXCLUDE } from "../../utils/frustumCulling";

// The models' hip pivots carry the same names, with a Blender export suffix on
// the second model (`Leg_L` vs `Leg_L001`), so the prefix is what is shared.
const LEFT_LEG_PREFIX = "Leg_L";
const RIGHT_LEG_PREFIX = "Leg_R";

type WalkLeg = {
  node: Object3D;
  restPitch: number;
};

export type EnemyWalkRig = {
  leftLeg: WalkLeg;
  rightLeg: WalkLeg;
};

const findLeg = (model: Object3D, prefix: string): Object3D | null => {
  let found: Object3D | null = null;
  model.traverse((object) => {
    if (!found && object.name.startsWith(prefix)) found = object;
  });
  return found;
};

export const createEnemyWalkRig = (model: Object3D): EnemyWalkRig | null => {
  const leftLeg = findLeg(model, LEFT_LEG_PREFIX);
  const rightLeg = findLeg(model, RIGHT_LEG_PREFIX);
  if (!leftLeg || !rightLeg) return null;

  // Per-frame leg swings must not trigger a fresh culling-bound measurement.
  leftLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE] = true;
  rightLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE] = true;
  return {
    leftLeg: { node: leftLeg, restPitch: leftLeg.rotation.x },
    rightLeg: { node: rightLeg, restPitch: rightLeg.rotation.x },
  };
};

export const updateEnemyWalkRig = (
  rig: EnemyWalkRig,
  simulationTime: number,
  amplitude: number,
  frequency: number,
  phase: number
): void => {
  const swing = Math.sin(simulationTime * frequency + phase) * amplitude;
  rig.leftLeg.node.rotation.x = rig.leftLeg.restPitch + swing;
  rig.rightLeg.node.rotation.x = rig.rightLeg.restPitch - swing;
};

export const resetEnemyWalkRig = (rig: EnemyWalkRig): void => {
  rig.leftLeg.node.rotation.x = rig.leftLeg.restPitch;
  rig.rightLeg.node.rotation.x = rig.rightLeg.restPitch;
};

export const releaseEnemyWalkRig = (rig: EnemyWalkRig): void => {
  resetEnemyWalkRig(rig);
  delete rig.leftLeg.node.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE];
  delete rig.rightLeg.node.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE];
};
