import { FC, memo, useLayoutEffect, useMemo, useRef } from "react";

import { Mesh, MeshStandardMaterial, SphereGeometry } from "three";

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
import { freezeSubtree } from "../../../utils/freezeSubtree";
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

  const meshRef = useRef<Mesh>(null);
  useLayoutEffect(() => {
    if (meshRef.current) freezeSubtree(meshRef.current);
  }, [radius]);

  return (
    <mesh
      ref={meshRef}
      name="ground"
      geometry={geometry}
      material={material}
      position={[0, getPlanetSphereMeshPositionY(radius), 0]}
      receiveShadow
    />
  );
});

Ground.displayName = "Ground";
