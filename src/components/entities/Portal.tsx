import { FC, useRef, useEffect, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color } from "three";
import type { Group, Mesh, MeshStandardMaterial, Quaternion } from "three";

import { getCssColorValue } from "../ui/lib/cssUtils";

// How far toward orange a fully stacked (tier 3) Reinforcements portal shifts.
// 1 keeps a clear green base, 3 reads as hot orange.
const REINFORCEMENT_TINT_MAX = 0.85;
const ORANGE_TINT = new Color("#f59e0b");

/** Maps the Reinforcements tier (0-3) to a green->orange lerp factor. */
const getReinforcementTint = (tier: number): number =>
  (Math.min(Math.max(tier, 0), 3) / 3) * REINFORCEMENT_TINT_MAX;

type PortalProps = {
  position: [number, number, number];
  pathYaw?: number;
  quaternion?: Quaternion;
  surfaceNormal?: [number, number, number];
  /** Reinforcements tier picked for the run (0 = none); tints the portal orange. */
  reinforcementsTier?: number;
};

export const Portal: FC<PortalProps> = memo(
  ({ position, pathYaw = 0, quaternion, surfaceNormal, reinforcementsTier = 0 }) => {
    const outerRingRef = useRef<Mesh>(null);
    const middleRingRef = useRef<Mesh>(null);
    const innerRingRef = useRef<Mesh>(null);
    const portalCoreRef = useRef<Mesh>(null);
    const particlesRef = useRef<(Mesh | null)[]>([]);
    const groupRef = useRef<Group>(null);
    const indicatorRefs = useRef<(Mesh | null)[]>([]);

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

      // Reinforcements tier rings: a gentle pulse marks how many extra
      // enemies the portal will throw, growing outward from the core.
      for (let i = 0; i < indicatorRefs.current.length; i++) {
        const indicator = indicatorRefs.current[i];
        if (!indicator) continue;
        const phase = ((time * 1.6 - i * 0.35) % 1 + 1) % 1;
        const scale = 0.5 + phase * 0.45;
        indicator.scale.setScalar(scale);
        (indicator.material as MeshStandardMaterial).opacity =
          0.5 * (1 - phase);
      }

      if (groupRef.current) {
        const pulse = Math.sin(time * 1.2) * 0.05;
        if (surfaceNormal) {
          const [nx, ny, nz] = surfaceNormal;
          groupRef.current.position.set(
            position[0] + nx * pulse,
            position[1] + ny * pulse,
            position[2] + nz * pulse
          );
        } else {
          groupRef.current.position.y = position[1] + pulse;
        }
      }
    });

    const reinforcementTier = Math.min(Math.max(reinforcementsTier, 0), 3);
    const tint = getReinforcementTint(reinforcementTier);

    // The portal's emissive drives its glow: keep the base colour on the
    // green scene identity and lerp the emissive toward orange as the
    // Reinforcements stack grows, so the portal itself warms up with the
    // upgrade. The emissive material is not shared across tiers, so the
    // per-tier tint never churns the cached base materials.
    const portalColor = getCssColorValue("scene-portal");
    const portalGlow = useMemo(
      () => new Color(getCssColorValue("scene-portal-glow")).lerp(ORANGE_TINT, tint),
      [tint]
    );

    return (
      <group
        ref={groupRef}
        position={position}
        {...(quaternion
          ? { quaternion }
          : { rotation: [0, pathYaw + Math.PI / 2, 0] as [number, number, number] })}
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

        {reinforcementTier > 0 &&
          Array.from({ length: reinforcementTier }, (_, index) => (
            <mesh
              key={`reinforcement-tier-${index}`}
              ref={(el) => {
                if (el) indicatorRefs.current[index] = el;
              }}
              position={[0, 0.06, 0]}
            >
              <torusGeometry args={[0.52, 0.02, 8, 40]} />
              <meshStandardMaterial
                color={portalGlow}
                emissive={portalGlow}
                emissiveIntensity={1}
                transparent
                opacity={0.4}
                depthWrite={false}
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
      (prevProps.pathYaw ?? 0) === (nextProps.pathYaw ?? 0) &&
      prevProps.quaternion === nextProps.quaternion &&
      prevProps.surfaceNormal === nextProps.surfaceNormal &&
      prevProps.reinforcementsTier === nextProps.reinforcementsTier
    );
  }
);

Portal.displayName = "Portal";
