import { forwardRef } from "react";
import type { BufferGeometry, Material, Mesh } from "three";

type EmissiveParticleSphereProps = {
  radius: number;
  color: string;
  emissiveIntensity: number;
  opacity: number;
  /** Shared geometry (e.g. a module-level singleton); omit to build one. */
  geometry?: BufferGeometry;
  /** Shared material; omit to build one. */
  material?: Material;
};

export const EmissiveParticleSphere = forwardRef<
  Mesh,
  EmissiveParticleSphereProps
>(
  (
    { radius, color, emissiveIntensity, opacity, geometry, material },
    ref
  ) => (
    <mesh ref={ref} geometry={geometry} material={material}>
      {!geometry && <sphereGeometry args={[radius, 8, 8]} />}
      {!material && (
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          transparent
          opacity={opacity}
        />
      )}
    </mesh>
  )
);

EmissiveParticleSphere.displayName = "EmissiveParticleSphere";
