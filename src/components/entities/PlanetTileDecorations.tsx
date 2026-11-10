import {
  Suspense,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type FC,
} from "react";
import { useGLTF } from "@react-three/drei";
import {
  BoxGeometry,
  type BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  type Mesh,
  MeshStandardMaterial,
  type Material,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { RUBBLE_MODELS, type RubbleModelSpec } from "../../constants/models";
import { hashGrid2D } from "../../core/tileGridHash";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
} from "../../utils/planetSurfaceMapping";
import type { TileOccupancyMasks } from "../../utils/tileOccupancy";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  pathYOffsetSelector,
  tileSizeSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { ModelLoadErrorBoundary } from "./ModelLoadErrorBoundary";
import { getCssColorValue } from "../ui/lib/cssUtils";

export type PlanetTileDecorationsProps = {
  occupancy: TileOccupancyMasks;
  /** The board size; defaults to the published level. The editor passes its
      draft grid so the rubble scatters over the board being built. */
  gridSize?: number;
};

// How often a free tile gets a rubble prop at all, plus the per-instance
// scale range. The GLBs are ~0.17-0.35 world units wide at unit scale, so
// this keeps props at a similar footprint to the old box props.
const RUBBLE_SURFACE_FRACTION = 0.32;
const RUBBLE_SCALE_MIN = 0.3;
const RUBBLE_SCALE_VARIANCE = 0.25;
const RUBBLE_OFFSET_FRACTION = 0.3;
// Per-instance color pitch: the models are flat grays, so tinting each
// instance by a small factor (0.85..1.15) around white makes repeated props
// read as varied stone instead of one cloned texture — the color analogue of
// sound pitching. Applied as `instanceColor` (multiplied onto the fragment
// material in the shader), so it stays one draw call per variant.
const RUBBLE_COLOR_PITCH = 0.15;

// Fallback stand-in (still loading, or a failed load): the old instanced box
// props, re-grounded at y = 0 like the rubble geometry, so the same instance
// matrices work for both.
const rubbleFallbackGeometry = new BoxGeometry(0.16, 0.07, 0.12);
rubbleFallbackGeometry.translate(0, 0.035, 0);

let rubbleFallbackMaterial: MeshStandardMaterial | null = null;

// Lazy (browser-only) so the CSS lookup never runs at module import; the
// material is shared by every fallback instance and lives for the app.
const getRubbleFallbackMaterial = (): MeshStandardMaterial => {
  if (!rubbleFallbackMaterial) {
    rubbleFallbackMaterial = new MeshStandardMaterial({
      color: getCssColorValue("scene-regolith-rock"),
      metalness: 0.12,
      roughness: 0.92,
    });
  }
  return rubbleFallbackMaterial;
};

// Shared scratch objects for the placement loop (no per-tile allocation).
const scratchObject = new Object3D();
const scratchBaseQuat = new Quaternion();
const scratchSpinQuat = new Quaternion();
const scratchNormal = new Vector3();
const scratchColor = new Color(1, 1, 1);
const UP = new Vector3(0, 1, 0);

/**
 * Deterministic per-tile randomizer: every free tile rolls the same
 * presence/variant/offset/rotation/scale on every load (and in the level
 * editor), so the rubble "spawns randomly" without ever re-rolling a given
 * level. `surfaceTopHeight` is the height of the land's visible top face above
 * the sphere surface (the slab's full `pathYOffset`), so each prop's grounded
 * base rests on the surface rather than half-buried in the slab.
 */
export type RubbleInstance = {
  matrix: Matrix4;
  /** A small per-instance tint around white (0.85..1.15) so repeated props
      don't read as one cloned texture. */
  color: Color;
};

export const buildRubbleMatrices = (
  occupancy: TileOccupancyMasks,
  gridSize: number,
  tileSize: number,
  surfaceTopHeight: number
): RubbleInstance[][] => {
  const perVariant: RubbleInstance[][] = Array.from(
    { length: RUBBLE_MODELS.length },
    () => []
  );
  const planetRadius = getPlanetRadius(gridSize, tileSize);

  for (let gridX = 0; gridX < gridSize; gridX += 1) {
    for (let gridZ = 0; gridZ < gridSize; gridZ += 1) {
      const index = gridZ * occupancy.gridSize + gridX;
      if (
        occupancy.onPath[index] === 1 ||
        occupancy.water[index] === 1 ||
        occupancy.canyon[index] === 1
      ) {
        continue;
      }

      if (hashGrid2D(gridX + 17, gridZ + 91) > RUBBLE_SURFACE_FRACTION) {
        continue;
      }

      const variant =
        Math.floor(hashGrid2D(gridX + 53, gridZ + 29) * RUBBLE_MODELS.length) %
        RUBBLE_MODELS.length;
      const hx = hashGrid2D(gridX + 31, gridZ + 5) - 0.5;
      const hz = hashGrid2D(gridX + 137, gridZ + 23) - 0.5;
      const rot = hashGrid2D(gridX + 99, gridZ + 13) * Math.PI * 2;
      const scale =
        RUBBLE_SCALE_MIN +
        RUBBLE_SCALE_VARIANCE * hashGrid2D(gridX + 2, gridZ + 7);
      const pitch =
        1 +
        (hashGrid2D(gridX + 211, gridZ + 167) * 2 - 1) * RUBBLE_COLOR_PITCH;
      scratchColor.setRGB(pitch, pitch, pitch);

      const wx =
        tileToWorldCoordinate(gridX, gridSize, tileSize) +
        hx * tileSize * RUBBLE_OFFSET_FRACTION;
      const wz =
        tileToWorldCoordinate(gridZ, gridSize, tileSize) +
        hz * tileSize * RUBBLE_OFFSET_FRACTION;

      const { surfacePoint, normal } = flatFieldToSphereSurface(
        wx,
        wz,
        planetRadius
      );
      scratchNormal.copy(normal);
      scratchObject.position
        .copy(surfacePoint)
        .addScaledVector(scratchNormal, surfaceTopHeight);
      scratchBaseQuat.setFromUnitVectors(UP, scratchNormal);
      scratchSpinQuat.setFromAxisAngle(scratchNormal, rot);
      scratchObject.quaternion.copy(scratchBaseQuat).multiply(scratchSpinQuat);
      scratchObject.scale.setScalar(scale);
      scratchObject.updateMatrix();
      perVariant[variant].push({
        matrix: scratchObject.matrix.clone(),
        color: scratchColor.clone(),
      });
    }
  }

  return perVariant;
};

// Bake one variant's GLB into a single geometry: merge all fragment meshes
// (all indexed with the same position/normal layout) with material groups so
// the fragment shades survive, then re-center on the origin in x/z and ground
// at y = 0, so an instance matrix needs only position/rotation/scale.
const bakeVariantGeometry = (
  scene: Object3D,
  node: string
): { geometry: BufferGeometry; materials: Material[] } | null => {
  const root = scene.getObjectByName(node);
  if (!root) return null;

  root.updateMatrixWorld(true);
  const fragmentMeshes: Mesh[] = [];
  root.traverse((object) => {
    if ((object as Mesh).isMesh) fragmentMeshes.push(object as Mesh);
  });
  if (fragmentMeshes.length === 0) return null;

  // The clones are consumed by mergeGeometries (their attributes are copied
  // into the merged buffer), so the clone buffers are released after the
  // merge and the originals are never touched.
  const fragments = fragmentMeshes.map((mesh) =>
    mesh.geometry.clone().applyMatrix4(mesh.matrixWorld)
  );
  const merged = mergeGeometries(fragments, true);
  fragments.forEach((fragment) => fragment.dispose());
  if (!merged) return null;

  // Re-center the footprint on the origin in x/z and ground it at y = 0, so
  // an instance matrix only carries position/rotation/scale.
  merged.computeBoundingBox();
  const { min, max } = merged.boundingBox!;
  merged.translate(-(min.x + max.x) / 2, -min.y, -(min.z + max.z) / 2);

  return {
    geometry: merged,
    materials: fragmentMeshes.map((mesh) => mesh.material as Material),
  };
};

type RubbleInstancedMeshProps = {
  name: string;
  geometry: BufferGeometry;
  material: Material | Material[];
  instances: RubbleInstance[];
  /** Disposes the geometry on unmount (the per-variant bakes); shared
      geometries (the fallback box) must not be disposed. */
  disposeGeometry?: boolean;
};

// Writes the per-instance matrices and colors and refreshes the derived GPU
// data. The renderer frustum-culls an InstancedMesh by its `boundingSphere`,
// which three derives from the instance matrices only when it is null and
// then caches — so it is recomputed after every write (including when the
// count is unchanged) to keep a re-decorated mesh from being culled by a
// stale sphere. Exported so the test can assert the refresh without a
// renderer.
export const applyRubbleMatrices = (
  mesh: InstancedMesh,
  instances: RubbleInstance[]
): void => {
  for (let i = 0; i < instances.length; i += 1) {
    mesh.setMatrixAt(i, instances[i].matrix);
    mesh.setColorAt(i, instances[i].color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
};

// One InstancedMesh per rubble variant (or its box fallback): a single
// draw call per variant, the per-instance matrix carrying only
// position/rotation/scale, and no raycast so the props never intercept
// tower-placement or hover input.
const RubbleInstancedMesh: FC<RubbleInstancedMeshProps> = ({
  name,
  geometry,
  material,
  instances,
  disposeGeometry,
}) => {
  const count = instances.length;
  const meshRef = useRef<InstancedMesh>(null);

  useEffect(() => {
    if (!disposeGeometry) return;
    return () => geometry.dispose();
  }, [geometry, disposeGeometry]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || count === 0) return;
    mesh.raycast = () => null;
    applyRubbleMatrices(mesh, instances);
  }, [geometry, material, instances, count]);

  if (count === 0) return null;

  return (
    <instancedMesh
      key={count}
      name={name}
      ref={meshRef}
      args={[geometry, material, count]}
      castShadow
      receiveShadow
    />
  );
};

type RubbleVariantProps = {
  spec: RubbleModelSpec;
  instances: RubbleInstance[];
};

const RubbleVariant: FC<RubbleVariantProps> = ({ spec, instances }) => {
  const gltf = useGLTF(spec.url);
  const baked = useMemo(
    () => bakeVariantGeometry(gltf.scene, spec.node),
    [gltf, spec.node]
  );

  if (!baked) return null;
  return (
    <RubbleInstancedMesh
      name={`rubble-${spec.node}`}
      geometry={baked.geometry}
      material={baked.materials}
      instances={instances}
      disposeGeometry
    />
  );
};

// One rubble variant isolated in its own Suspense + error boundary: a slow
// load shows the box fallback for this variant only, and a failed load
// (network error, 404, parse error) keeps the box fallback permanently
// instead of unmounting the scene.
const RubbleVariantSlot: FC<RubbleVariantProps> = ({ spec, instances }) => {
  const fallback = (
    <RubbleInstancedMesh
      name={`rubble-fallback-${spec.node}`}
      geometry={rubbleFallbackGeometry}
      material={getRubbleFallbackMaterial()}
      instances={instances}
    />
  );

  return (
    <ModelLoadErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <RubbleVariant spec={spec} instances={instances} />
      </Suspense>
    </ModelLoadErrorBoundary>
  );
};

// Rubble decorations are static per level: they only depend on path geometry
// and water (via the shared occupancy masks), never on towers or on the
// simulation, so the instance matrices are built once per level load. The
// randomizer is deterministic (hashGrid2D per tile), so every load of the
// same level scatters the same rubble in the same places.
export const PlanetTileDecorations: FC<PlanetTileDecorationsProps> = memo(
  ({ occupancy, gridSize: gridSizeProp }) => {
    const pathYOffset = useGameStore(pathYOffsetSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const storeGridSize = useLevelStore(gridSizeSelector);
    const gridSize = gridSizeProp ?? storeGridSize;

    const instancesPerVariant = useMemo(
      () => buildRubbleMatrices(occupancy, gridSize, tileSize, pathYOffset),
      [occupancy, gridSize, tileSize, pathYOffset]
    );

    if (instancesPerVariant.every((instances) => instances.length === 0)) {
      return null;
    }

    return (
      <group name="rubble-decorations">
        {RUBBLE_MODELS.map((spec, variant) => (
          <RubbleVariantSlot
            key={spec.node}
            spec={spec}
            instances={instancesPerVariant[variant]}
          />
        ))}
      </group>
    );
  }
);

PlanetTileDecorations.displayName = "PlanetTileDecorations";
