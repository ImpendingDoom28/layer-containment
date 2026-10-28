import { forwardRef, memo } from "react";
import type { Mesh } from "three";

type EmissiveTorusProps = {
  torusArgs: [number, number, number, number];
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
          position={position}
          rotation={rotation}
          scale={scaleTuple}
        >
          <torusGeometry args={torusArgs} />
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
