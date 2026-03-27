import { forwardRef, memo } from "react";
import { TorusGeometry, type BufferGeometry, type Mesh } from "three";

export const UPGRADE_RING_TORUS_GEOMETRY = new TorusGeometry(1, 0.018, 6, 16);

type EmissiveTorusProps = {
  geometry?: BufferGeometry;
  torusArgs?: [number, number, number, number];
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  color: string;
  emissiveIntensity: number;
  opacity: number;
};

export const EmissiveTorus = memo(
  forwardRef<Mesh, EmissiveTorusProps>(
    (
      {
        geometry,
        torusArgs,
        position = [0, 0, 0],
        rotation = [-Math.PI / 2, 0, 0],
        scale = 1,
        color,
        emissiveIntensity,
        opacity,
      },
      ref
    ) => {
      const scaleTuple: [number, number, number] = Array.isArray(scale)
        ? scale
        : [scale, scale, scale];

      return (
        <mesh
          ref={ref}
          geometry={geometry}
          position={position}
          rotation={rotation}
          scale={scaleTuple}
        >
          {!geometry && torusArgs ? <torusGeometry args={torusArgs} /> : null}
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={emissiveIntensity}
            transparent
            opacity={opacity}
          />
        </mesh>
      );
    }
  )
);

EmissiveTorus.displayName = "EmissiveTorus";
