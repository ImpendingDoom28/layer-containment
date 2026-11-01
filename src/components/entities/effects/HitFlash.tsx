import {
  useLayoutEffect,
  useRef,
  useState,
  type FC,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { type Group, type Material, type Mesh, type Object3D } from "three";

// The hit marker is a slightly larger copy of the body, re-pointed at the
// per-enemy flash material, so its shape always matches the body: a sphere
// body gets a sphere, the Wraith drone a Wraith-shaped envelope, a future box
// model a box — no per-model support code.
const FLASH_SCALE = 1.12;

const buildFlashClone = (body: Object3D, flashMaterial: Material): Object3D => {
  const clone = body.clone(true);
  // Scale the whole rendered transform (position + scale) about the body
  // center so the envelope grows around the body. For the Wraith the body
  // group is recentered via its position, so scaling only the group's scale
  // would leave the offset unscaled and shift the shell off-center.
  clone.position.multiplyScalar(FLASH_SCALE);
  clone.scale.multiplyScalar(FLASH_SCALE);
  clone.traverse((object) => {
    if ((object as Partial<Mesh>).isMesh) {
      (object as Mesh).material = flashMaterial;
    }
  });
  clone.visible = false;
  return clone;
};

type HitFlashProps = {
  body: ReactNode;
  /** The per-enemy flash material the marker renders with. */
  flashMaterial: Material;
  /** Receives the current marker so the parent can toggle `visible` on hits. */
  markerRef?: { current: Object3D | null };
};

/**
 * Wraps an enemy body and provides its hit-flash marker: a hidden clone of the
 * body's rendered subtree, re-pointed at `flashMaterial` and scaled slightly
 * larger about the body center. The parent animates `flashMaterial.opacity` on
 * a hit and toggles the marker's `visible` (the marker is the body's own shape,
 * so no per-model marker code is needed).
 *
 * The clone is rebuilt only when the body's rendered node changes — detected
 * by comparing the node's uuid — so it tracks a Suspense body falling back to
 * (and later resolving to) its model; steady-state frames just compare. The
 * clone *references* the body's shared geometry, so the primitive is mounted
 * with `dispose={null}`: R3F must not free the shared buffers when the marker
 * is rebuilt or the enemy unmounts.
 */
export const HitFlash: FC<HitFlashProps> = ({
  body,
  flashMaterial,
  markerRef,
}) => {
  const bodyContainerRef = useRef<Group>(null);
  const markerRefLocal = useRef<Object3D>(null);
  const [marker, setMarker] = useState<Object3D | null>(null);
  const bodyKeyRef = useRef("");

  const rebuildMarker = () => {
    const container = bodyContainerRef.current;
    if (!container || container.children.length === 0) return;
    const bodyNode = container.children[0];
    if (bodyNode.uuid === bodyKeyRef.current) return;
    bodyKeyRef.current = bodyNode.uuid;
    setMarker(() => buildFlashClone(bodyNode, flashMaterial));
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

  const attachMarker = (node: Object3D | null) => {
    markerRefLocal.current = node;
    if (markerRef) markerRef.current = node;
  };

  return (
    <>
      <group ref={bodyContainerRef}>{body}</group>
      {marker && (
        <primitive ref={attachMarker} object={marker} dispose={null} />
      )}
    </>
  );
};

HitFlash.displayName = "HitFlash";
