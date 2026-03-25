import { FC, useRef, useEffect, memo } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, Group } from "three";

import { getCssColorValue } from "../ui/lib/cssUtils";

type PortalProps = {
  position: [number, number, number];
  pathYaw?: number;
};

export const Portal: FC<PortalProps> = memo(
  ({ position, pathYaw = 0 }) => {
    const outerRingRef = useRef<Mesh>(null);
    const middleRingRef = useRef<Mesh>(null);
    const innerRingRef = useRef<Mesh>(null);
    const portalCoreRef = useRef<Mesh>(null);
    const particlesRef = useRef<(Mesh | null)[]>([]);
    const groupRef = useRef<Group>(null);

    useEffect(() => {
      particlesRef.current = Array.from({ length: 12 }, () => null);
    }, []);

    useFrame((state) => {
      const time = state.clock.elapsedTime;

      if (outerRingRef.current) {
        outerRingRef.current.rotation.y = time * 0.8;
      }
      if (middleRingRef.current) {
        middleRingRef.current.rotation.y = -time * 1.2;
      }
      if (innerRingRef.current) {
        innerRingRef.current.rotation.y = time * 1.5;
      }

      if (portalCoreRef.current) {
        const pulse = Math.sin(time * 2) * 0.1 + 1;
        portalCoreRef.current.scale.set(pulse, pulse, pulse);
        const material = portalCoreRef.current
          .material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 0.3 + Math.sin(time * 3) * 0.2;
      }

      particlesRef.current.forEach((particle, index) => {
        if (!particle) return;
        const angle =
          (index / particlesRef.current.length) * Math.PI * 2 + time;
        const radius = 0.4 + Math.sin(time * 2 + index) * 0.1;
        particle.position.x = Math.cos(angle) * radius;
        particle.position.z = Math.sin(angle) * radius;
        particle.position.y = Math.sin(time * 1.5 + index * 0.5) * 0.2;

        particle.rotation.y = time * 2 + index;
        particle.rotation.x = time * 1.5;
      });

      if (groupRef.current) {
        groupRef.current.position.y = position[1] + Math.sin(time * 1.2) * 0.05;
      }
    });

    const portalColor = getCssColorValue("scene-portal");
    const portalGlow = getCssColorValue("scene-portal-glow");

    return (
      <group
        ref={groupRef}
        position={position}
        rotation={[0, pathYaw + Math.PI / 2, 0]}
      >
        <mesh ref={outerRingRef}>
          <torusGeometry args={[0.4, 0.04, 16, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.6}
            transparent
            opacity={0.8}
          />
        </mesh>

        <mesh ref={middleRingRef}>
          <torusGeometry args={[0.3, 0.03, 16, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.5}
            transparent
            opacity={0.7}
          />
        </mesh>

        <mesh ref={innerRingRef}>
          <torusGeometry args={[0.2, 0.02, 16, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.7}
            transparent
            opacity={0.9}
          />
        </mesh>

        <mesh ref={portalCoreRef} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.3}
            transparent
            opacity={0.6}
          />
        </mesh>

        {particlesRef.current.map((_, index) => (
          <mesh
            key={`portal-particle-${index}`}
            ref={(el) => {
              if (el) particlesRef.current[index] = el;
            }}
          >
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial
              color={portalColor}
              emissive={portalGlow}
              emissiveIntensity={1}
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}

        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.05, 16]} />
          <meshStandardMaterial
            color={getCssColorValue("scene-gray-700")}
            emissive={getCssColorValue("scene-gray-800")}
            emissiveIntensity={0.1}
          />
        </mesh>
      </group>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.position[0] === nextProps.position[0] &&
      prevProps.position[1] === nextProps.position[1] &&
      prevProps.position[2] === nextProps.position[2] &&
      (prevProps.pathYaw ?? 0) === (nextProps.pathYaw ?? 0)
    );
  }
);

Portal.displayName = "Portal";
