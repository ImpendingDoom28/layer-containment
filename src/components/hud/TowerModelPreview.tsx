import {
  memo,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type FC,
} from "react";

import { Canvas, useThree } from "@react-three/fiber";
import { Box3, Group, Vector3, type Object3D } from "three";

import type { TowerModelSpec } from "../../core/types/game";
import { ModelLoader } from "../entities/ModelLoader";

// The largest span (any axis) a preview model is scaled to: it must fit the
// square box with margin, so it is smaller than the box's visible extent
// (see the camera below).
const PREVIEW_MAX_SPAN = 1.3;

// Shared scratch state for the one-time per-model fit/center math (the shop
// shows a handful of models, and the effect runs once per load).
const _box = new Box3();
const _center = new Vector3();
const _size = new Vector3();

type PreviewRigProps = {
  model: TowerModelSpec;
};

/**
 * Fits a loaded model into the square preview: the whole model is scaled so
 * its largest bounding-box span is `PREVIEW_MAX_SPAN`, centered on the origin,
 * and rotated to a three-quarter view (the camera stays on the +Z axis). Runs
 * once per load (the object only changes when the GLB resolves), never per
 * frame.
 */
const PreviewRig: FC<PreviewRigProps> = ({ model }) => {
  const innerRef = useRef<Group>(null);
  const [object, setObject] = useState<Object3D | null>(null);

  const onObjectReady = useCallback((obj: Object3D | null) => {
    setObject(obj);
  }, []);

  // `frameloop="demand"` only re-renders on invalidation, so the canvas must
  // be told to draw once the model resolves (a state update alone does not
  // invalidate the R3F loop).
  const invalidate = useThree((state) => state.invalidate);

  useLayoutEffect(() => {
    const group = innerRef.current;
    if (!group || !object) return;
    _box.setFromObject(object);
    _box.getCenter(_center);
    _box.getSize(_size);
    const maxSpan = Math.max(_size.x, _size.y, _size.z);
    const scale = maxSpan > 0 ? PREVIEW_MAX_SPAN / maxSpan : 1;
    group.scale.setScalar(scale);
    group.position.set(
      -_center.x * scale,
      -_center.y * scale,
      -_center.z * scale,
    );
    invalidate();
  }, [object, invalidate]);

  return (
    <group rotation-y={-0.55}>
      <group ref={innerRef}>
        <ModelLoader
          url={model.url}
          node={model.node}
          fallback={null}
          onObjectReady={onObjectReady}
        />
      </group>
    </group>
  );
};

PreviewRig.displayName = "PreviewRig";

type TowerModelPreviewProps = {
  model: TowerModelSpec;
};

/**
 * A small 3D preview of a tower's model: the shared GLB (the same asset the
 * placed towers render) fitted into a compact square box. The box is a
 * self-contained R3F canvas, so it renders outside the main game scene — the
 * shop shows the real model without mounting it into the level.
 *
 * The model is loaded through the same `useGLTF` cache the game scene uses,
 * so the shop never downloads or re-parses a tower's GLB twice; in the shop
 * the assets are already preloaded by `GamePage` before the HUD mounts. The
 * camera and lights are fixed (the box is small and static), and `frameloop`
 * is "demand" so the canvas only re-renders when the model first resolves —
 * a still preview with near-zero idle render cost.
 */
export const TowerModelPreview: FC<TowerModelPreviewProps> = memo(
  ({ model }) => (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: [0, 0, 3], fov: 30 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[1.5, 2, 1.5]} intensity={1.1} />
        <directionalLight position={[-1.5, 1, -1]} intensity={0.3} />
        <PreviewRig model={model} />
      </Canvas>
    </div>
  )
);

TowerModelPreview.displayName = "TowerModelPreview";
