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
import { prepareTowerModel } from "../entities/TowerModel";

// The base is first fitted to 1 unit by `prepareTowerModel` (the same transform
// the placed towers use, so the model looks exactly like the board). The whole
// prepared model is then rescaled to `PREVIEW_FIT_SPAN` so it fills the square
// box, like a tower filling its tile in a top-down shot. The 45° camera below
// makes the visible square at the model's depth 2 * (3*√2) * tan(15°) ≈ 2.56
// units, so 2.4 fills about 94% of the image; a protruding barrel may clip the
// box edge, which the rounded box and the bottom gradient hide.
const PREVIEW_FIT_SPAN = 2.4;

// The preview's viewing angle: the model is turned 45° about its vertical (Y)
// axis so the turret reads on a diagonal, matching the top-down board view.
const PREVIEW_TURN_Y = Math.PI / 4;

// The camera's viewing angle: 45° down from the horizontal (a top angle, not
// straight down), so the tower's body and turret are both visible — the model
// reads as "itself", not just its top. [0, 3, 3] gives exactly 45°.
const PREVIEW_CAMERA_POSITION: [number, number, number] = [0, 3, 3];

// √2/2: the projection factor for a 45° view (see the width/height math below).
const PROJECTION_FACTOR = Math.SQRT1_2;

// Reuses the board's base-fit transform so the preview reads like a placed
// tower: base fitted to 1 unit, centered on the origin, grounded at y = 0.
const prepareForPreview = (source: Object3D) =>
  prepareTowerModel(source, 1);

// Shared scratch state for the one-time per-model fit math (the shop shows a
// handful of models, and the effect runs once per load).
const _box = new Box3();
const _center = new Vector3();
const _size = new Vector3();

type PreviewRigProps = {
  model: TowerModelSpec;
};

/**
 * Points the camera straight at the origin from a 45° top angle and fits the
 * loaded model into the square box: the model (already base-fitted, centered,
 * and grounded by `prepareTowerModel`) is scaled so its larger projected
 * on-screen dimension spans `PREVIEW_FIT_SPAN`, and centered on the origin so
 * it fills the box. Runs once per load (the object only changes when the GLB
 * resolves), never per frame.
 */
const PreviewRig: FC<PreviewRigProps> = ({ model }) => {
  const innerRef = useRef<Group>(null);
  const [object, setObject] = useState<Object3D | null>(null);

  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  const onObjectReady = useCallback((obj: Object3D | null) => {
    setObject(obj);
  }, []);

  useLayoutEffect(() => {
    // Top angle: 45° down from the horizontal, looking at the origin. The
    // default up (0,1,0) is fine here (the camera is not looking straight down
    // the Y axis), so the box's +Z reads at the top, like a top-down map.
    camera.up.set(0, 1, 0);
    camera.position.set(...PREVIEW_CAMERA_POSITION);
    camera.lookAt(0, 0, 0);

    const group = innerRef.current;
    if (!group || !object) return;
    _box.setFromObject(object);
    _box.getCenter(_center);
    _box.getSize(_size);
    // From a 45° camera the projected on-screen width is (x + z) * √2/2 and
    // the height (y + z) * √2/2 (the far and near edges of the footprint, plus
    // the height, collapse along the view axis). Fit on the larger so the
    // model fills the square box without clipping the near edge.
    const projectedW = (_size.x + _size.z) * PROJECTION_FACTOR;
    const projectedH = (_size.y + _size.z) * PROJECTION_FACTOR;
    const projectedSpan = Math.max(projectedW, projectedH);
    const scale = projectedSpan > 0 ? PREVIEW_FIT_SPAN / projectedSpan : 1;
    group.scale.setScalar(scale);
    group.position.set(
      -_center.x * scale,
      -_center.y * scale,
      -_center.z * scale,
    );
    // `frameloop="demand"` only re-renders on invalidation, so tell the canvas
    // to draw once the model resolves (a state update alone does not).
    invalidate();
  }, [object, invalidate, camera]);

  return (
    <group rotation-y={PREVIEW_TURN_Y}>
      <group ref={innerRef}>
        <ModelLoader
          url={model.url}
          node={model.node}
          prepare={prepareForPreview}
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
 * A small 3D preview of a tower's model seen from a 45° top angle (like the
 * game board, but steeper so the model fills the box): the shared GLB (the
 * same asset the placed towers render) turned 45° and fitted to fill a compact
 * square box. The box is a self-contained R3F canvas, so it renders outside
 * the main game scene — the shop shows the real model without mounting it into
 * the level.
 *
 * The model is loaded through the same `useGLTF` cache the game scene uses,
 * so the shop never downloads or re-parses a tower's GLB twice; in the shop
 * the assets are already preloaded by `GamePage` before the HUD mounts. It is
 * prepared with the board's own base-fit transform (`prepareTowerModel`), so
 * it reads exactly like a placed tower. The camera and lights are fixed (the
 * box is small and static), and `frameloop` is "demand" so the canvas only
 * re-renders when the model first resolves — a still preview with near-zero
 * idle render cost.
 */
export const TowerModelPreview: FC<TowerModelPreviewProps> = memo(
  ({ model }) => (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <Canvas
        dpr={[1, 1.5]}
        frameloop="demand"
        camera={{ position: PREVIEW_CAMERA_POSITION, fov: 30 }}
        gl={{ antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[1.5, 3, 1.5]} intensity={1.1} />
        <directionalLight position={[-1.5, 1, -1]} intensity={0.35} />
        <PreviewRig model={model} />
      </Canvas>
    </div>
  )
);

TowerModelPreview.displayName = "TowerModelPreview";
