import { FC, memo, useMemo } from "react";

import { MeshStandardMaterial, SphereGeometry } from "three";

import {
  gridSizeSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import {
  getPlanetRadius,
  getPlanetSphereMeshPositionY,
} from "../../../utils/planetSurfaceMapping";
import { getCssColorValue } from "../../ui/lib/cssUtils";

const SPHERE_WIDTH_SEGMENTS = 100;
const SPHERE_HEIGHT_SEGMENTS = 100;

export const Ground: FC = memo(() => {
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);

  const radius = getPlanetRadius(gridSize, tileSize);

  const geometry = useMemo(
    () =>
      new SphereGeometry(radius, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS),
    [radius]
  );

  const material = useMemo(() => {
    return new MeshStandardMaterial({
      color: getCssColorValue("scene-gray-700"),
      metalness: 0.08,
      roughness: 0.9,
    });
  }, []);

  return (
    <mesh
      name="ground"
      geometry={geometry}
      material={material}
      position={[0, getPlanetSphereMeshPositionY(radius), 0]}
      receiveShadow
    />
  );
});

Ground.displayName = "Ground";
