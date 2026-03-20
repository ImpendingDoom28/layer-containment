import { FC } from "react";

import { getCssColorValue } from "../ui/lib/cssUtils";

type EndBuildingProps = {
  position: [number, number, number];
};

export const EndBuilding: FC<EndBuildingProps> = ({ position }) => {
  const buildingColor = getCssColorValue("scene-white");
  const buildingAccent = getCssColorValue("scene-gray-200");
  const roofColor = getCssColorValue("scene-gray-300");

  return (
    <group position={position}>
      {/* Main building base */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.6, 0.8, 0.6]} />
        <meshStandardMaterial
          color={buildingColor}
          emissive={buildingAccent}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Building top section */}
      <mesh position={[0, 0.9, 0]}>
        <boxGeometry args={[0.5, 0.3, 0.5]} />
        <meshStandardMaterial
          color={buildingAccent}
          emissive={buildingAccent}
          emissiveIntensity={0.08}
        />
      </mesh>

      {/* Roof */}
      <mesh position={[0, 1.15, 0]}>
        <coneGeometry args={[0.35, 0.2, 8]} />
        <meshStandardMaterial
          color={roofColor}
          emissive={roofColor}
          emissiveIntensity={0.05}
        />
      </mesh>

      {/* Decorative corner pillars */}
      {[
        [-0.25, 0.5, -0.25],
        [0.25, 0.5, -0.25],
        [-0.25, 0.5, 0.25],
        [0.25, 0.5, 0.25],
      ].map(([x, y, z], index) => (
        <mesh key={`pillar-${index}`} position={[x, y, z]}>
          <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
          <meshStandardMaterial
            color={buildingAccent}
            emissive={buildingAccent}
            emissiveIntensity={0.1}
          />
        </mesh>
      ))}

      {/* Base platform */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 16]} />
        <meshStandardMaterial
          color={getCssColorValue("scene-gray-700")}
          emissive={getCssColorValue("scene-gray-800")}
          emissiveIntensity={0.1}
        />
      </mesh>

      {/* Warning light on top */}
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          color={getCssColorValue("scene-building-warning")}
          emissive={getCssColorValue("scene-building-warning")}
          emissiveIntensity={0.8}
        />
      </mesh>
    </group>
  );
};
