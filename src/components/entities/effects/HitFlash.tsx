import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  BufferGeometry,
  Matrix4,
  Mesh,
  type Group,
  type Material,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// The hit marker is a slightly larger copy of the body, re-pointed at the
// per-enemy flash material, so its shape always matches the body: a sphere
// body gets a sphere, the Wraith drone a Wraith-shaped envelope, a future box
// model a box — no per-model support code.
const FLASH_SCALE = 1.12;

type FlashMarker = {
  root: Object3D;
  // New buffers created by the build (one merged geometry per distinct source
  // geometry); the body's shared geometries are only referenced, never owned.
  geometries: BufferGeometry[];
};

const _toLocal = new Matrix4();
const _partMatrix = new Matrix4();

const buildFlashMarker = (body: Object3D, flashMaterial: Material): FlashMarker => {
  const clone = body.clone(true);
  // Scale the whole rendered transform (position + scale) about the body
  // center so the envelope grows around the body. For the Wraith the body
  // group is recentered via its position, so scaling only the group's scale
  // would leave the offset unscaled and shift the shell off-center.
  clone.position.multiplyScalar(FLASH_SCALE);
  clone.scale.multiplyScalar(FLASH_SCALE);
  clone.updateWorldMatrix(true, true);

  // The marker is static for its whole lifetime (the parent only toggles
  // `visible` and drives the shared material's opacity), so it is merged at
  // build time: each distinct source geometry's meshes are baked into one
  // geometry (Bridge pattern — temp parts disposed after the merge) and the
  // marker holds one mesh per source geometry. The parts are baked in the
  // clone's LOCAL space (relative to its own transform), so the merged marker
  // follows the enemy exactly like the original clone did; the clone's own
  // (scaled) transform is kept on the root.
  _toLocal.copy(clone.matrixWorld).invert();
  const byGeometry = new Map<BufferGeometry, BufferGeometry[]>();
  clone.traverse((object) => {
    if (!(object as Partial<Mesh>).isMesh) return;
    const mesh = object as Mesh;
    _partMatrix.multiplyMatrices(_toLocal, mesh.matrixWorld);
    const part = mesh.geometry.clone().applyMatrix4(_partMatrix);
    const parts = byGeometry.get(mesh.geometry);
    if (parts) {
      parts.push(part);
    } else {
      byGeometry.set(mesh.geometry, [part]);
    }
  });

  clone.clear();
  const geometries: BufferGeometry[] = [];
  for (const parts of byGeometry.values()) {
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts);
    // The single-part case reuses the (already baked) clone as the merged
    // geometry, so only genuinely temporary parts are disposed here.
    if (parts.length > 1) parts.forEach((part) => part.dispose());
    geometries.push(merged);
    clone.add(new Mesh(merged, flashMaterial));
  }
  clone.visible = false;
  return { root: clone, geometries };
};

type HitFlashProps = {
  body: ReactNode;
  /** The per-enemy flash material the marker renders with. */
  flashMaterial: Material;
  /** Receives the current marker so the parent can toggle `visible` on hits. */
  markerRef?: { current: Object3D | null };
};

/**
 * Wraps an enemy body and provides its hit-flash marker: a hidden merge of the
 * body's rendered meshes, re-pointed at `flashMaterial` and scaled slightly
 * larger about the body center. The parent animates `flashMaterial.opacity` on
 * a hit and toggles the marker's `visible` (the marker is the body's own shape,
 * so no per-model marker code is needed).
 *
 * The marker is rebuilt only when the body's rendered node changes — detected
 * by comparing the node's uuid — so it tracks a Suspense body falling back to
 * (and later resolving to) its model; steady-state frames just compare. The
 * build clones the body's shared geometries into new merged buffers (the
 * merged mesh needs its own buffers), so the marker owns and disposes them on
 * rebuild/unmount; the body's own buffers are never touched, which is why the
 * primitive mounts with `dispose={null}`.
 */
export const HitFlash: FC<HitFlashProps> = ({
  body,
  flashMaterial,
  markerRef,
}) => {
  const bodyContainerRef = useRef<Group>(null);
  const markerRefLocal = useRef<Object3D>(null);
  const [marker, setMarker] = useState<FlashMarker | null>(null);
  const bodyKeyRef = useRef("");

  const rebuildMarker = () => {
    const container = bodyContainerRef.current;
    if (!container || container.children.length === 0) return;
    const bodyNode = container.children[0];
    if (bodyNode.uuid === bodyKeyRef.current) return;
    bodyKeyRef.current = bodyNode.uuid;
    setMarker(() => buildFlashMarker(bodyNode, flashMaterial));
  };

  // Runs after the body's commit so the marker can be built from the body
  // node it wraps (including the first mount).
  useLayoutEffect(() => {
    rebuildMarker();
  });

  useFrame(() => {
    // The body can swap nodes without a re-render (a Suspense fallback
    // resolving to its model), so re-check every frame and rebuild the clone
    // only when it actually changed.
    const container = bodyContainerRef.current;
    if (!container || container.children.length === 0) return;
    const bodyNode = container.children[0];
    if (bodyNode.uuid !== bodyKeyRef.current) rebuildMarker();
  });

  useEffect(() => {
    if (!marker) return;
    return () => {
      marker.geometries.forEach((geometry) => geometry.dispose());
    };
  }, [marker]);

  const attachMarker = (node: Object3D | null) => {
    markerRefLocal.current = node;
    if (markerRef) markerRef.current = node;
  };

  return (
    <>
      <group ref={bodyContainerRef}>{body}</group>
      {marker && (
        <primitive ref={attachMarker} object={marker.root} dispose={null} />
      )}
    </>
  );
};

HitFlash.displayName = "HitFlash";
