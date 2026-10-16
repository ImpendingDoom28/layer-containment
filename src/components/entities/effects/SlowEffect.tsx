import { useFrame } from "@react-three/fiber";
import { FC, memo, useEffect, useRef } from "react";
import { Mesh } from "three";

import { getCssColorValue } from "../../ui/lib/cssUtils";

import { EmissiveParticleSphere } from "./primitives/EmissiveParticleSphere";
import { EmissiveTorus } from "./primitives/EmissiveTorus";
import type { EnemyAttachedEffectProps } from "./types";

type SlowEffectProps = EnemyAttachedEffectProps & {
  enemySize: number;
};

export const SlowEffect: FC<SlowEffectProps> = memo(
  ({ enemySize, getTimeScale }) => {
    const ringRef = useRef<Mesh>(null);
    const particlesRef = useRef<(Mesh | null)[]>([]);
    const timeRef = useRef(0);

    useFrame((_, delta) => {
      timeRef.current += delta * getTimeScale();
      const time = timeRef.current;

      if (ringRef.current) {
        ringRef.current.rotation.y = time * 2;
        const pulse = Math.sin(time * 3) * 0.1 + 1;
        ringRef.current.scale.set(pulse, pulse, pulse);
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

    useEffect(() => {
      particlesRef.current = Array.from({ length: 6 }, () => null);
    }, []);

    const slowColor = getCssColorValue("scene-slow");

    return (
      <group position={[0, enemySize / 2, 0]}>
        <EmissiveTorus
          ref={ringRef}
          torusArgs={[enemySize * 1.25, 0.03, 8, 32]}
          color={slowColor}
          emissiveIntensity={0.3}
          opacity={0.5}
        />
        {particlesRef.current.map((_, index) => (
          <EmissiveParticleSphere
            key={`slow-particle-${_?.id ?? index}`}
            ref={(el) => {
              if (el) particlesRef.current[index] = el;
            }}
            radius={0.04}
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
