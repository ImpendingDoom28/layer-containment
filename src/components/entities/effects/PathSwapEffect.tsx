import { FC, memo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MeshStandardMaterial, type Mesh } from "three";
import type { Entity } from "koota";

import {
  PATH_SWAP_ARRIVAL_SECONDS,
  PATH_SWAP_TELEGRAPH_SECONDS,
  PathSwap,
} from "../../../core/ecs/traits/pathSwap";
import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";

import { EmissiveParticleSphere } from "./primitives/EmissiveParticleSphere";
import { EmissiveTorus } from "./primitives/EmissiveTorus";
import {
  applyDualRingBurst,
  type DualRingBurstSpec,
} from "./utils/dualRingBurst";

type PathSwapEffectProps = {
  entity: Entity;
  enemySize: number;
};

// The path-swap telegraph plays in light blue (sky-300) — distinct from the
// enemy's own color and from the other effects, so the wind-up reads as the
// boss "charging up" the front-cross. The body blinks in sync (Enemy.tsx).
const PATH_SWAP_COLOR = "#7dd3fc";

// Particles that gather around the ring while the wind-up plays.
const WIND_UP_PARTICLE_COUNT = 6;
// Ring radius as a multiple of the enemy size: the ring sits just past the
// body so it is visible around it from the top-down camera. All ring and
// particle sizes below are multiples of this, so the whole effect scales with
// the enemy (the Ferryman at size 1.5 gets a proportionally larger telegraph).
const RING_RADIUS = 1.3;
// Unit torus geometry (major radius 1); the mesh is scaled to
// RING_RADIUS * enemySize so the ring is proportional to the body.
const TORUS_ARGS: [number, number, number, number] = [1, 0.07, 8, 32];

const ARRIVAL_WHITE = "#ffffff";
// The arrival burst expands from the ring's resting scale outward, mirroring
// the medic heal burst's expanding rings.
const ARRIVAL_SPEC: DualRingBurstSpec = {
  baseScale: 1, // overridden per-enemy below (see arrivalSpec)
  ring1: {
    scale: (p, b) => b * (1 + p * 1.3),
    opacity: (p) => (1 - p) * 0.6,
  },
  ring2: {
    scale: (p, b) => b * (1 + p * 0.7),
    opacity: (p) => (1 - p * 0.85) * 0.4,
  },
};

const setOpacity = (mesh: Mesh | null, opacity: number): void => {
  if (!mesh) return;
  (mesh.material as MeshStandardMaterial).opacity = opacity;
  (mesh.material as MeshStandardMaterial).transparent = true;
};
const hide = (mesh: Mesh | null): void => setOpacity(mesh, 0);

/**
 * Enemy-anchored visuals for the generic path-swap ability (the Ferryman's
 * front-cross), rendered on the enemy group so they are never occluded by the
 * body the way a ground-level burst is:
 *
 * - **Wind-up:** while a telegraph is in flight (`telegraphReadyAt` is ahead
 *   of the simulation clock) a pulsing double ring around the enemy breathes
 *   and swells toward the jump, with particles rising from it — the ring
 *   vanishes exactly when the jump happens.
 * - **Arrival:** right after a cross (`lastCrossAt` just passed) a quick
 *   expanding dual-ring burst plays at the new position.
 *
 * Like the upgrade visuals, everything is scaled by `enemySize` and driven
 * imperatively in `useFrame` (no per-frame re-renders), writing each mesh's
 * own material/transform via refs. The countdowns run on the simulation clock,
 * so both the freeze and the visuals pause with the game. The trait is present
 * while a wind-up is in flight and for `PATH_SWAP_ARRIVAL_SECONDS` after a
 * cross, so the component is mounted only while something is (or is about to
 * be) visible.
 */
export const PathSwapEffect: FC<PathSwapEffectProps> = memo(
  ({ entity, enemySize }) => {
    const { getSimulationTime, getTimeScale } = useSimulationClock();

    const windupRingRef = useRef<Mesh>(null);
    const windupInnerRingRef = useRef<Mesh>(null);
    const windupParticleRefs = useRef<(Mesh | null)[]>([]);
    const arrivalRing1Ref = useRef<Mesh>(null);
    const arrivalRing2Ref = useRef<Mesh>(null);
    // Wind-up progress (0..1) across the current telegraph; reset when a new
    // telegraph opens so a re-started wind-up doesn't skip ahead.
    const windupProgressRef = useRef(0);
    const prevReadyAtRef = useRef(0);

    // The arrival burst expands from the ring's resting scale, so its base
    // scale is that resting scale (proportional to the enemy size).
    const arrivalSpec: DualRingBurstSpec = {
      ...ARRIVAL_SPEC,
      baseScale: RING_RADIUS * enemySize,
    };

    useFrame((state, delta) => {
      const now = getSimulationTime(state.clock.elapsedTime);
      const swap = entity.get(PathSwap);
      if (!swap) {
        // The trait was removed (or a one-frame gap): hide everything.
        hide(windupRingRef.current);
        hide(windupInnerRingRef.current);
        for (const p of windupParticleRefs.current) hide(p);
        hide(arrivalRing1Ref.current);
        hide(arrivalRing2Ref.current);
        return;
      }

      const scaledDelta = delta * getTimeScale();
      const baseRadius = RING_RADIUS * enemySize;

      // --- Wind-up (a telegraph is in flight) -------------------------------
      const inFlight =
        swap.telegraphReadyAt > 0 && swap.telegraphReadyAt > now;
      if (inFlight) {
        if (prevReadyAtRef.current !== swap.telegraphReadyAt) {
          // A new telegraph opened: restart the wind-up animation.
          prevReadyAtRef.current = swap.telegraphReadyAt;
          windupProgressRef.current = 0;
        }
        windupProgressRef.current = Math.min(
          windupProgressRef.current +
            scaledDelta / PATH_SWAP_TELEGRAPH_SECONDS,
          1
        );
      }

      if (!inFlight) {
        hide(windupRingRef.current);
        hide(windupInnerRingRef.current);
        for (const particle of windupParticleRefs.current) hide(particle);
      } else {
        const p = windupProgressRef.current;
        // The rings breathe (~1.5Hz) and swell toward the jump; the last
        // stretch of the wind-up reads as "jumping now".
        const breathe = 1 + Math.sin(p * Math.PI * 3) * 0.08;
        const swell = 1 + p * 0.35;
        const s = baseRadius * breathe * swell;
        windupRingRef.current?.scale.set(s, s, s);
        setOpacity(windupRingRef.current, 0.5 + 0.3 * Math.sin(p * Math.PI * 3) + p * 0.2);
        const innerS = s * 0.72;
        windupInnerRingRef.current?.scale.set(innerS, innerS, innerS);
        setOpacity(windupInnerRingRef.current, 0.35 + p * 0.2);

        for (let i = 0; i < WIND_UP_PARTICLE_COUNT; i++) {
          const particle = windupParticleRefs.current[i];
          if (!particle) continue;
          const angle = i * ((Math.PI * 2) / WIND_UP_PARTICLE_COUNT) + p * 1.2;
          const r = baseRadius * (0.85 + p * 0.3);
          particle.position.set(
            Math.cos(angle) * r,
            enemySize * (0.05 + p * 1.2),
            Math.sin(angle) * r
          );
          particle.scale.setScalar(enemySize * (0.5 + p * 1.5));
          setOpacity(particle, 0.85);
        }
      }

      // --- Arrival (a cross just happened) ----------------------------------
      const since = swap.lastCrossAt > 0 ? now - swap.lastCrossAt : Infinity;
      if (since >= 0 && since < PATH_SWAP_ARRIVAL_SECONDS) {
        applyDualRingBurst(
          arrivalRing1Ref.current,
          arrivalRing2Ref.current,
          since / PATH_SWAP_ARRIVAL_SECONDS,
          arrivalSpec
        );
      } else {
        hide(arrivalRing1Ref.current);
        hide(arrivalRing2Ref.current);
      }
    });

    return (
      <group>
        {/* Wind-up: double ring + rising particles, around the body. */}
        <group>
          <EmissiveTorus
            ref={windupRingRef}
            torusArgs={TORUS_ARGS}
            position={[0, 0.08 * enemySize, 0]}
            scale={RING_RADIUS * enemySize}
            color={PATH_SWAP_COLOR}
            emissiveIntensity={1.2}
            opacity={0}
          />
          <EmissiveTorus
            ref={windupInnerRingRef}
            torusArgs={TORUS_ARGS}
            position={[0, 0.06 * enemySize, 0]}
            scale={RING_RADIUS * enemySize * 0.72}
            color={PATH_SWAP_COLOR}
            emissiveIntensity={0.9}
            opacity={0}
          />
          {Array.from({ length: WIND_UP_PARTICLE_COUNT }, (_, index) => (
            <EmissiveParticleSphere
              key={`swap-particle-${index}`}
              ref={(el) => {
                if (el) windupParticleRefs.current[index] = el;
              }}
              radius={0.12}
              color={PATH_SWAP_COLOR}
              emissiveIntensity={1.5}
              opacity={0}
            />
          ))}
        </group>

        {/* Arrival: quick expanding burst at the new position. */}
        <EmissiveTorus
          ref={arrivalRing1Ref}
          torusArgs={TORUS_ARGS}
          position={[0, 0.08 * enemySize, 0]}
          scale={RING_RADIUS * enemySize}
          color={PATH_SWAP_COLOR}
          emissiveIntensity={1.4}
          opacity={0}
        />
        <EmissiveTorus
          ref={arrivalRing2Ref}
          torusArgs={TORUS_ARGS}
          position={[0, 0.08 * enemySize, 0]}
          scale={RING_RADIUS * enemySize * 0.8}
          color={ARRIVAL_WHITE}
          emissiveIntensity={1.2}
          opacity={0}
        />
      </group>
    );
  }
);

PathSwapEffect.displayName = "PathSwapEffect";
