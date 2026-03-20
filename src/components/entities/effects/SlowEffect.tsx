import { useFrame } from "@react-three/fiber";
import { FC, memo, useEffect, useRef } from "react";
import { Mesh } from "three";

import { getCssColorValue } from "../../ui/lib/cssUtils";

type SlowEffectProps = {
  enemySize: number;
  shouldStopMovement: boolean;
};

export const SlowEffect: FC<SlowEffectProps> = memo(
  ({ enemySize, shouldStopMovement }) => {
    const ringRef = useRef<Mesh>(null);
    const particlesRef = useRef<(Mesh | null)[]>([]);

    useFrame((state) => {
      if (shouldStopMovement) return;

      const time = state.clock.elapsedTime;

      // Animate rotating ring
      if (ringRef.current) {
        ringRef.current.rotation.y = time * 2;
        const pulse = Math.sin(time * 3) * 0.1 + 1;
        ringRef.current.scale.set(pulse, pulse, pulse);
      }

      // Animate floating particles
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
        {/* Rotating ring around enemy */}
        <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[enemySize * 1.25, 0.03, 8, 32]} />
          <meshStandardMaterial
            color={slowColor}
            emissive={slowColor}
            emissiveIntensity={0.3}
            transparent
            opacity={0.5}
          />
        </mesh>

        {/* Floating particles */}
        {particlesRef.current.map((_, index) => (
          <mesh
            key={`slow-particle-${_?.id ?? index}`}
            ref={(el) => {
              if (el) particlesRef.current[index] = el;
            }}
          >
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial
              color={slowColor}
              emissive={slowColor}
              emissiveIntensity={1}
              transparent
              opacity={0.5}
            />
          </mesh>
        ))}
      </group>
    );
  }
);

SlowEffect.displayName = "SlowEffect";
