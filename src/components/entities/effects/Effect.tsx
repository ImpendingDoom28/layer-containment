import { FC, useRef, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

type EffectProps = {
  position: [number, number, number];
  color: string;
  duration?: number;
  onComplete?: () => void;
};

export const Effect: FC<EffectProps> = memo(
  ({ position, color, duration = 0.5, onComplete }) => {
    const ring1Ref = useRef<Mesh>(null);
    const ring2Ref = useRef<Mesh>(null);
    const particlesRef = useRef<Mesh[]>([]);
    const startTimeRef = useRef<number | null>(null);

    useFrame((state) => {
      startTimeRef.current ??= state.clock.elapsedTime;

      const elapsed = state.clock.elapsedTime - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      if (progress >= 1 && onComplete) {
        onComplete();
        return;
      }

      // Animate rings expanding and fading
      if (ring1Ref.current) {
        const scale = 1 + progress * 2;
        const opacity = 1 - progress;
        ring1Ref.current.scale.set(scale, scale, scale);
        const material = ring1Ref.current
          .material as THREE.MeshStandardMaterial;
        material.opacity = opacity * 0.6;
        material.transparent = true;
      }

      if (ring2Ref.current) {
        const scale = 1 + progress * 1.5;
        const opacity = 1 - progress * 0.8;
        ring2Ref.current.scale.set(scale, scale, scale);
        const material = ring2Ref.current
          .material as THREE.MeshStandardMaterial;
        material.opacity = opacity * 0.4;
        material.transparent = true;
      }

      // Animate particles
      particlesRef.current.forEach((particle, index) => {
        if (!particle) return;
        const angle = (index / particlesRef.current.length) * Math.PI * 2;
        const distance = progress * 1.5;
        particle.position.x = Math.cos(angle) * distance;
        particle.position.z = Math.sin(angle) * distance;
        particle.position.y = progress * 0.5;
        const material = particle.material as THREE.MeshStandardMaterial;
        material.opacity = 1 - progress;
        material.transparent = true;
      });
    });

    // Create particles array
    useEffect(() => {
      particlesRef.current = Array.from({ length: 8 }, () => null) as [];
    }, []);

    return (
      <group position={position}>
        {/* Expanding ring 1 */}
        <mesh ref={ring1Ref} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.3, 0.05, 8, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.5}
            transparent
            opacity={0.6}
          />
        </mesh>

        {/* Expanding ring 2 */}
        <mesh ref={ring2Ref} rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.25, 0.03, 8, 32]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={0.3}
            transparent
            opacity={0.4}
          />
        </mesh>

        {/* Particles */}
        {particlesRef.current.map((_, index) => (
          <mesh
            key={`particle-${index}`}
            ref={(el) => {
              if (el) particlesRef.current[index] = el;
            }}
          >
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.8}
              transparent
              opacity={1}
            />
          </mesh>
        ))}
      </group>
    );
  }
);

Effect.displayName = "Effect";
