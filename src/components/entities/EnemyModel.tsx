import { useCallback, useRef, memo, type FC, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Box3,
  Euler,
  Group,
  Mesh,
  Quaternion,
  Vector3,
  type Object3D,
} from "three";

import {
  ENEMY_MODEL_ROTATION_Y,
  ENEMY_MODELS,
  type EnemyModelSpec,
} from "../../constants/models";
import {
  getLocomotionPhase,
  SPLITTER_BREATH_AMPLITUDE,
  SPLITTER_BREATH_FREQUENCY,
  WRAITH_BOB_AMPLITUDE_RATIO,
  WRAITH_BOB_FREQUENCY,
} from "../../constants/enemyLocomotion";
import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../core/hooks/useReducedMotion";
import type { EnemyType } from "../../core/types/game";
import { ModelLoader } from "./ModelLoader";

// Shared, cached scratch vectors for the one-time recenter math (enemies
// spawn a handful at a time; the vectors are reused and are not per-frame).
const _center = new Vector3();
const _size = new Vector3();
const _offset = new Vector3();
const _quat = new Quaternion();
const _euler = new Euler();

/**
 * Rescales a model so its largest span equals `size`, recenters it on the
 * origin, then yaws it so the nose points down the group's local +X (the
 * enemy's direction of travel). The source node is cloned, so the cached GLTF
 * (shared by every enemy) is never mutated; the clone only *references* the
 * shared geometry/material, so it needs no dispose on unmount.
 */
const prepareModel = (
  source: Object3D,
  size: number,
  rotationY: number
): Group => {
  source.updateWorldMatrix(true, true);
  const box = new Box3().setFromObject(source);
  box.getCenter(_center);
  box.getSize(_size);
  const maxSpan = Math.max(_size.x, _size.y, _size.z);
  const scale = maxSpan > 0 ? size / maxSpan : 1;
  // Offset = -(scale) * R * center: the center is rotated into the target
  // orientation before being negated, so the recentered model stays centered
  // for any yaw.
  _euler.set(0, rotationY, 0);
  _quat.setFromEuler(_euler);
  _offset.copy(_center).multiplyScalar(scale).applyQuaternion(_quat).negate();

  const group = new Group();
  group.position.copy(_offset);
  group.quaternion.copy(_quat);
  group.scale.setScalar(scale);
  const clone = source.clone();
  // Enemy models are physical, so let them cast and receive shadows like the
  // other enemy bodies (the plain sphere fallback gets the same flags in Enemy).
  clone.traverse((child) => {
    if ((child as Partial<Mesh>).isMesh) {
      (child as Mesh).castShadow = true;
      (child as Mesh).receiveShadow = true;
    }
  });
  group.add(clone);
  return group;
};

type EnemyModelProps = {
  type: EnemyType;
  size: number;
  fallback: ReactNode;
  /** Stable per-enemy seed (the enemy id) so a wave never animates in sync. */
  seed?: number;
};

/**
 * Renders the 3D model of an enemy type as the body. Loading, node extraction,
 * and Suspense isolation are all delegated to the generic `ModelLoader`; this
 * component only supplies the shared `prepare` transform (scale to the body's
 * diameter, recenter, and yaw the nose into the direction of travel). `size`
 * is the enemy body radius; `type` picks the model from `ENEMY_MODELS`.
 *
 * On top of the static model it runs the per-type idle locomotion on the
 * pause-aware simulation clock: the Wraith drone hover-bobs and the
 * Splitter's cell colony breathes (a ±3% scale loop), so the bodies read as
 * creatures rather than static assets. All idle motion is skipped under
 * `prefers-reduced-motion`.
 */
export const EnemyModel: FC<EnemyModelProps> = memo(
  ({ type, size, fallback, seed = 0 }) => {
    const model: EnemyModelSpec = ENEMY_MODELS[type];
    const { getSimulationTime } = useSimulationClock();
    const reducedMotion = useReducedMotion();
    const prepare = useCallback(
      (source: Object3D) =>
        prepareModel(source, size * 2, ENEMY_MODEL_ROTATION_Y),
      [size]
    );

    const locomotionRef = useRef<Group>(null);
    // Under reduced motion the rest pose is restored once per toggle instead
    // of rewriting the same values every frame.
    const reducedMotionResetRef = useRef(false);
    const phase = getLocomotionPhase(seed);

    useFrame((state) => {
      const group = locomotionRef.current;
      if (!group) return;
      if (reducedMotion) {
        if (!reducedMotionResetRef.current) {
          reducedMotionResetRef.current = true;
          group.position.y = 0;
          group.scale.setScalar(1);
        }
        return;
      }
      reducedMotionResetRef.current = false;
      const time = getSimulationTime(state.clock.elapsedTime);
      if (type === "fast") {
        group.position.y =
          Math.sin(time * WRAITH_BOB_FREQUENCY + phase) *
          size *
          WRAITH_BOB_AMPLITUDE_RATIO;
      } else if (type === "splitter") {
        group.scale.setScalar(
          1 + Math.sin(time * SPLITTER_BREATH_FREQUENCY + phase) * SPLITTER_BREATH_AMPLITUDE
        );
      }
    });

    return (
      <group ref={locomotionRef}>
        <ModelLoader
          url={model.url}
          node={model.node}
          prepare={prepare}
          fallback={fallback}
        />
      </group>
    );
  }
);

EnemyModel.displayName = "EnemyModel";
