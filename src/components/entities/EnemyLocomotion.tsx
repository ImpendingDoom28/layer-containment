import {
  memo,
  useEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
  type RefObject,
} from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Object3D } from "three";
import type { Entity } from "koota";

import { getDeathSquashScale } from "../../constants/enemyLocomotion";
import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../core/hooks/useReducedMotion";
import {
  EnemyMotion,
  EnemyState,
  requestEnemyDeath,
} from "../../core/ecs/traits/enemy";
import { EnemyLocomotion as EnemyLocomotionTrait } from "../../core/ecs/traits/locomotion";
import {
  createEnemyWalkRig,
  releaseEnemyWalkRig,
  resetEnemyWalkRig,
  updateEnemyWalkRig,
  type EnemyWalkRig,
} from "./enemyWalkRig";

type EnemyLocomotionProps = {
  entity: Entity;
  modelRef: RefObject<Object3D | null>;
  children: ReactNode;
};

/**
 * Animates the enemy body from the entity's `EnemyLocomotion` trait — the
 * spec is resolved at spawn (see `spawnEnemy`), so this component never
 * branches on enemy type or model and works identically for a GLB body and
 * the sphere fallback. All motion runs on the pause-aware simulation clock
 * (freezes on pause, speeds up with the time scale) and is skipped under
 * `prefers-reduced-motion`.
 *
 * Channels: hover bob (vertical sine), breathing (scale oscillation),
 * biped walking (opposed hip-pivot swings on models with leg nodes), and the
 * death squash-stretch: while the ECS holds the dead entity back for
 * `deathPreburstSeconds`, the body squashes down and wide, then stretches
 * upward — the removal, the burst, and the split shrapnel land at the pop.
 */
export const EnemyLocomotion: FC<EnemyLocomotionProps> = memo(
  ({ entity, modelRef, children }) => {
    const { getSimulationTime } = useSimulationClock();
    const reducedMotion = useReducedMotion();

    // Cold data, set once at spawn — snapshot it like `Enemy` does with
    // `EnemyState`'s cold fields.
    const [spec] = useState(() => entity.get(EnemyLocomotionTrait));

    const groupRef = useRef<Group>(null);
    const walkRigRef = useRef<EnemyWalkRig | null>(null);
    const walkModelRef = useRef<Object3D | null>(null);
    // Under reduced motion the rest pose is restored once per toggle instead
    // of rewriting the same values every frame.
    const reducedMotionResetRef = useRef(false);
    const deathAnimStartRef = useRef<number | null>(null);

    useEffect(
      () => () => {
        if (walkRigRef.current) releaseEnemyWalkRig(walkRigRef.current);
      },
      []
    );

    useFrame((state) => {
      const group = groupRef.current;
      if (!group || !spec) return;

      if (spec.walkAmplitude > 0 && modelRef.current !== walkModelRef.current) {
        if (walkRigRef.current) releaseEnemyWalkRig(walkRigRef.current);
        walkModelRef.current = modelRef.current;
        walkRigRef.current = walkModelRef.current
          ? createEnemyWalkRig(walkModelRef.current)
          : null;
      }

      if (reducedMotion) {
        if (!reducedMotionResetRef.current) {
          reducedMotionResetRef.current = true;
          group.position.y = 0;
          group.scale.set(1, 1, 1);
          if (walkRigRef.current) resetEnemyWalkRig(walkRigRef.current);
        }
        return;
      }
      reducedMotionResetRef.current = false;
      const time = getSimulationTime(state.clock.elapsedTime);

      // Death anticipation: the ECS keeps the dead entity for the pre-burst
      // window, so drive the squash-stretch here instead of the idle motion.
      // The start time comes from the death request's stamp once the death
      // system has processed the kill, so the animation and the ECS hold can
      // never drift apart by a frame; the local ref covers the one frame
      // between the killing blow and the stamp.
      if (spec.deathPreburstSeconds > 0) {
        const live = entity.get(EnemyState);
        if (live && live.health <= 0) {
          deathAnimStartRef.current ??= time;
          const requestedAt = entity.get(requestEnemyDeath)?.requestedAt;
          const start =
            requestedAt != null && requestedAt >= 0
              ? requestedAt
              : deathAnimStartRef.current;
          const progress = (time - start) / spec.deathPreburstSeconds;
          const { y, xz } = getDeathSquashScale(progress);
          group.scale.set(xz, y, xz);
          return;
        }
      }

      const walkRig = walkRigRef.current;
      if (walkRig && !entity.get(EnemyMotion)?.hasReachedEnd) {
        updateEnemyWalkRig(
          walkRig,
          time,
          spec.walkAmplitude,
          spec.walkFrequency,
          spec.phase
        );
      }

      if (spec.bobAmplitude > 0) {
        group.position.y =
          Math.sin(time * spec.bobFrequency + spec.phase) * spec.bobAmplitude;
      }
      if (spec.breathAmplitude > 0) {
        group.scale.setScalar(
          1 +
            Math.sin(time * spec.breathFrequency + spec.phase) *
              spec.breathAmplitude
        );
      }
    });

    return <group ref={groupRef}>{children}</group>;
  }
);

EnemyLocomotion.displayName = "EnemyLocomotion";
