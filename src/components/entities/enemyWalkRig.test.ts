import { describe, expect, it } from "vitest";
import { Group, Object3D } from "three";

import { FRUSTUM_CULL_SNAPSHOT_EXCLUDE } from "../../utils/frustumCulling";
import {
  createEnemyWalkRig,
  releaseEnemyWalkRig,
  resetEnemyWalkRig,
  updateEnemyWalkRig,
} from "./enemyWalkRig";

const makeModel = (leftName: string, rightName: string) => {
  const model = new Group();
  const leftLeg = new Object3D();
  const rightLeg = new Object3D();
  leftLeg.name = leftName;
  rightLeg.name = rightName;
  leftLeg.rotation.x = 0.1;
  rightLeg.rotation.x = -0.2;
  model.add(leftLeg, rightLeg);
  return { model, leftLeg, rightLeg };
};

describe("enemyWalkRig", () => {
  it("swings the legs in opposition around their rest pitches", () => {
    const { model, leftLeg, rightLeg } = makeModel("Leg_L", "Leg_R");
    const rig = createEnemyWalkRig(model);
    expect(rig).not.toBeNull();

    const time = 0.25;
    const amplitude = 0.55;
    const frequency = 9.5;
    const phase = 0.3;
    updateEnemyWalkRig(rig!, time, amplitude, frequency, phase);

    const swing = Math.sin(time * frequency + phase) * amplitude;
    expect(leftLeg.rotation.x).toBeCloseTo(0.1 + swing, 6);
    expect(rightLeg.rotation.x).toBeCloseTo(-0.2 - swing, 6);
    expect(leftLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBe(true);
    expect(rightLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBe(true);
  });

  it("binds the medic model's suffixed pivot names", () => {
    const { model, leftLeg, rightLeg } = makeModel("Leg_L001", "Leg_R001");
    const rig = createEnemyWalkRig(model);

    expect(rig).not.toBeNull();
    expect(rig!.leftLeg.node).toBe(leftLeg);
    expect(rig!.rightLeg.node).toBe(rightLeg);
  });

  it("does not create a rig when either leg pivot is absent", () => {
    const { model, rightLeg, leftLeg } = makeModel("Leg_L", "Leg_R");
    model.remove(rightLeg);

    expect(createEnemyWalkRig(model)).toBeNull();
    expect(leftLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBeUndefined();
  });

  it("restores the rest pose for reduced motion", () => {
    const { model, leftLeg, rightLeg } = makeModel("Leg_L", "Leg_R");
    const rig = createEnemyWalkRig(model)!;
    updateEnemyWalkRig(rig, 1, 0.55, 9.5, 0);
    expect(leftLeg.rotation.x).not.toBe(0.1);

    resetEnemyWalkRig(rig);

    expect(leftLeg.rotation.x).toBe(0.1);
    expect(rightLeg.rotation.x).toBe(-0.2);
  });

  it("restores the pose and culling flags when released", () => {
    const { model, leftLeg, rightLeg } = makeModel("Leg_L", "Leg_R");
    const rig = createEnemyWalkRig(model)!;
    updateEnemyWalkRig(rig, 1, 0.55, 9.5, 0);

    releaseEnemyWalkRig(rig);

    expect(leftLeg.rotation.x).toBe(0.1);
    expect(rightLeg.rotation.x).toBe(-0.2);
    expect(leftLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBeUndefined();
    expect(rightLeg.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE]).toBeUndefined();
  });
});
