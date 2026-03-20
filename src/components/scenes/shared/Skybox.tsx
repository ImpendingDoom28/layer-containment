import { FC, useMemo } from "react";

import { getCssColorValue } from "../../ui/lib/cssUtils";

type SkyboxProps = {
  starCount?: number;
  baseColor?: string;
  starColor?: string;
};

export const Skybox: FC<SkyboxProps> = ({
  starCount = 450,
  baseColor = getCssColorValue("scene-sky-base"),
  starColor = getCssColorValue("scene-white"),
}) => {
  const SKYBOX_RADIUS = 100;
  const STAR_MIN_SIZE = 0.02;
  const STAR_MAX_SIZE = 0.08;

  const starPositions = useMemo(() => {
    const positions: Array<{
      x: number;
      y: number;
      z: number;
      size: number;
      intensity: number;
    }> = [];

    for (let i = 0; i < starCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      const radius = SKYBOX_RADIUS * 0.99;

      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.sin(phi) * Math.sin(theta);
      const z = radius * Math.cos(phi);

      const size =
        STAR_MIN_SIZE + Math.random() * (STAR_MAX_SIZE - STAR_MIN_SIZE);
      const intensity = 0.5 + Math.random() * 0.5;

      positions.push({ x, y, z, size, intensity });
    }

    return positions;
  }, [starCount]);

  return (
    <group>
      <mesh renderOrder={-1}>
        <sphereGeometry args={[SKYBOX_RADIUS, 32, 32]} />
        <meshBasicMaterial
          color={baseColor}
          side={2}
          depthWrite={false}
          depthTest={false}
        />
      </mesh>

      {starPositions.map((star, index) => (
        <mesh key={index} position={[star.x, star.y, star.z]} renderOrder={-1}>
          <sphereGeometry args={[star.size, 8, 8]} />
          <meshBasicMaterial
            color={starColor}
            depthWrite={false}
            depthTest={false}
            opacity={star.intensity}
            transparent
          />
        </mesh>
      ))}
    </group>
  );
};
