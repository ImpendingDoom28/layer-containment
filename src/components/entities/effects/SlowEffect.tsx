import { useFrame } from "@react-three/fiber";
import { FC, memo, useMemo, useRef } from "react";
import type { Mesh } from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { getCssColorValue } from "../../ui/lib/cssUtils";

import { EmissiveParticleSphere } from "./primitives/EmissiveParticleSphere";
import { EmissiveTorus } from "./primitives/EmissiveTorus";
import {
  getParticleMaterial,
  PARTICLE_SPHERE_04_GEOMETRY,
  SLOW_TORUS_GEOMETRY,
} from "./primitives/sharedEffectAssets";

type SlowEffectProps = {
  enemySize: number;
};

const PARTICLE_COUNT = 6;

export const SlowEffect: FC<SlowEffectProps> = memo(
  ({ enemySize }) => {
    const { getTimeScale } = useSimulationClock();
    const ringRef = useRef<Mesh>(null);
    const particlesRef = useRef<(Mesh | null)[]>(
      Array.from({ length: PARTICLE_COUNT }, () => null)
    );
    const timeRef = useRef(0);
    const slowColor = getCssColorValue("scene-slow");
    // All 6 particles share one material (identical props, no per-frame
    // material writes) and the module-level 0.04 sphere; the torus unit
    // geometry is scaled per enemy at the mesh level.
    const particleMaterial = useMemo(
      () => getParticleMaterial(slowColor, 1, 0.5),
      [slowColor]
    );

    useFrame((_, delta) => {
      timeRef.current += delta * getTimeScale();
      const time = timeRef.current;

      if (ringRef.current) {
        ringRef.current.rotation.y = time * 2;
        const pulse = Math.sin(time * 3) * 0.1 + 1;
        // The unit torus (0.024 tube) scaled uniformly reproduces the old
        // [1.25 * size, 0.03] torus exactly, so the pulse stays uniform.
        ringRef.current.scale.setScalar(enemySize * 1.25 * pulse);
      }

      particlesRef.current.forEach((particle, index) => {
        if (!particle) return;
        const angle =
          (index / particlesRef.current.length) * Math.PI * 2 + time;
        const radius = enemySize * 1.3;
        particle.position.x = Math.cos(angle) * radius;
        particle.position.z = Math.sin(angle) * radius;
        particle.position.y = Math.sin(time * 2 + index) * 0.2;
      });
    });

    return (
      <group position={[0, enemySize / 2, 0]}>
        <EmissiveTorus
          ref={ringRef}
          torusArgs={[enemySize * 1.25, 0.03, 8, 32]}
          geometry={SLOW_TORUS_GEOMETRY}
          color={slowColor}
          emissiveIntensity={0.3}
          opacity={0.5}
        />
        {particlesRef.current.map((_, index) => (
          <EmissiveParticleSphere
            key={`slow-particle-${index}`}
            ref={(el) => {
              if (el) particlesRef.current[index] = el;
            }}
            radius={0.04}
            geometry={PARTICLE_SPHERE_04_GEOMETRY}
            material={particleMaterial}
            color={slowColor}
            emissiveIntensity={1}
            opacity={0.5}
          />
        ))}
      </group>
    );
  }
);

SlowEffect.displayName = "SlowEffect";
