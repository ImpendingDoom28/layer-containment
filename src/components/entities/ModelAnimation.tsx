import {
  Suspense,
  memo,
  useEffect,
  useMemo,
  useRef,
  type FC,
  type ReactNode,
} from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { type Mesh, type Object3D } from "three";

import { useReducedMotion } from "../../core/hooks/useReducedMotion";
import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import {
  FRUSTUM_CULL_SNAPSHOT_EXCLUDE,
} from "../../utils/frustumCulling";
import {
  ModelAnimationMixer,
  type ModelAnimationSpec,
} from "../../utils/modelAnimationMixer";
import { prepareModelTransform } from "../../utils/prepareModelTransform";
import { ModelLoadErrorBoundary } from "./ModelLoadErrorBoundary";

type ModelAnimationProps = {
  /** URL of the GLB to load (served from `public/`). */
  url: string;
  /** Name of the node inside the GLB to render (a file may hold many). */
  node: string;
  /**
   * The body radius the model is fitted to: the model's largest span is
   * rescaled to `size * 2` (the body diameter), matching `EnemyModel`.
   */
  size: number;
  /** Yaw (radians) applied after recentering — `ENEMY_MODEL_ROTATION_Y` for a body that faces local +Z. */
  rotationY: number;
  /**
   * Logical animation state → clip. The clip is named by the *GLB's* clip
   * name (the animation data lives in the model file), so a new animated model
   * is a config change, not a code change.
   */
  spec: ModelAnimationSpec;
  /**
   * Returns the logical animation state to play this frame (a key of `spec`),
   * or `null` to hold the rest pose. Called every frame with the scene clock's
   * raw elapsed time (the resolver applies its own pause-aware clock to it);
   * a change from the previous frame is what actually triggers a clip
   * hand-off, so a stable value costs nothing.
   */
  getState: (rawNow: number) => string | null;
  /** Rendered while the GLB loads (and as a permanent stand-in if it fails). */
  fallback: ReactNode;
  /**
   * Called once with the body object when it becomes available and again with
   * `null` on unmount (consumers use it to reach the body node, e.g. to blink
   * it during a telegraph). Pass a stable reference.
   */
  onModelReady?: (object: Object3D | null) => void;
};

/**
 * A generic player for a model's own baked-in animation clips (the
 * `gltf.animations` array). This is the "animations live in the model" path:
 * the GLB carries its clips (a walk, a teleport, ...), and the level config
 * only *names* which clip serves which logical state (`spec`). The component
 * never branches on a specific model or enemy type — it renders any animated
 * GLB the same way.
 *
 * The model is extracted by name, rescaled/recentered/yawed by
 * `prepareModelTransform`, and cloned (geometry and materials shared with the
 * `useGLTF` cache, so a clone adds no GPU buffers and needs no dispose). The
 * clone is **not** baked (`bakeStaticModel` would merge its meshes out of the
 * animated pivots and break the clips) — it is a plain `clone(true)` that
 * keeps the named nodes the clips bind to.
 *
 * Playback runs on the pause-aware simulation clock: `update` advances by
 * `delta * getTimeScale()`, so the motion freezes with the world on pause and
 * runs faster with the time dilation. The logical state is resolved per frame
 * by `getState`; only an actual change triggers a clip hand-off (the mixer
 * crossfades / hands off between clips — see `ModelAnimationMixer`). Under
 * `prefers-reduced-motion` the body holds its rest pose (the mixer is stopped
 * and never advanced).
 *
 * The animated subtree is flagged out of the frustum-culling staleness
 * snapshot so the perpetual clip motion does not re-measure the culling
 * bounding sphere every frame (the rest-pose sphere is a conservative bound —
 * the clip displacements are far inside the culling hysteresis margin).
 *
 * Loading is isolated in its own `Suspense` boundary (a slow load suspends
 * only this body) and a `ModelLoadErrorBoundary` (a failed load renders the
 * `fallback` instead of unmounting the whole scene), exactly like `ModelLoader`.
 */
export const ModelAnimation: FC<ModelAnimationProps> = memo(
  ({ url, node, size, rotationY, spec, getState, fallback, onModelReady }) => (
    <ModelLoadErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <ModelAnimationBody
          url={url}
          node={node}
          size={size}
          rotationY={rotationY}
          spec={spec}
          getState={getState}
          fallback={fallback}
          onModelReady={onModelReady}
        />
      </Suspense>
    </ModelLoadErrorBoundary>
  )
);

ModelAnimation.displayName = "ModelAnimation";

const ModelAnimationBody: FC<ModelAnimationProps> = ({
  url,
  node,
  size,
  rotationY,
  spec,
  getState,
  fallback,
  onModelReady,
}) => {
  const gltf = useGLTF(url);
  const { getTimeScale } = useSimulationClock();
  const reducedMotion = useReducedMotion();

  const source = gltf.scene.getObjectByName(node);
  const object = useMemo(() => {
    if (!source) return null;
    // Clone first, then measure the clone: `setFromObject` uses world-space
    // matrices, so measuring `source` would fold in the transforms of its
    // ancestors — which the (parentless) mounted clone does not have. For an
    // untransformed root node the two agree.
    const clone = source.clone(true);
    const group = prepareModelTransform(clone, size * 2, rotationY);
    // Physical body: cast and receive shadows like the other enemy bodies.
    clone.traverse((child) => {
      if ((child as Partial<Mesh>).isMesh) {
        (child as Mesh).castShadow = true;
        (child as Mesh).receiveShadow = true;
      }
    });
    // The whole model animates (or will as more clips are added): keep its
    // subtree out of the frustum-culling staleness snapshot so the clip motion
    // does not re-measure the culling sphere every frame.
    clone.userData[FRUSTUM_CULL_SNAPSHOT_EXCLUDE] = true;
    group.add(clone);
    return group;
  }, [source, size, rotationY]);

  const mixerRef = useRef<ModelAnimationMixer | null>(null);
  const lastStateRef = useRef<string | null>(null);
  // Under reduced motion the rest pose is restored once per toggle instead of
  // rewriting it every frame.
  const reducedMotionResetRef = useRef(false);

  useEffect(() => {
    if (object && gltf.animations.length > 0) {
      mixerRef.current = new ModelAnimationMixer(object, gltf.animations, spec);
    }
    return () => {
      mixerRef.current?.dispose();
      mixerRef.current = null;
      lastStateRef.current = null;
    };
  }, [object, gltf.animations, spec]);

  // Report the body to the consumer when it appears (or changes) and notify
  // them of the unmount with `null`, so the consumer can release its handle.
  useEffect(() => {
    if (!onModelReady) return;
    if (!object) return;
    onModelReady(object);
    return () => onModelReady(null);
  }, [object, onModelReady]);

  useFrame((state, delta) => {
    const mixer = mixerRef.current;
    if (!mixer || !mixer.hasClips) return;

    if (reducedMotion) {
      if (!reducedMotionResetRef.current) {
        reducedMotionResetRef.current = true;
        mixer.stopAll();
        lastStateRef.current = null;
      }
      return;
    }
    reducedMotionResetRef.current = false;

    const next = getState(state.clock.elapsedTime);
    if (next !== lastStateRef.current) {
      lastStateRef.current = next;
      if (next !== null) mixer.play(next);
      else mixer.stopAll();
    }
    mixer.update(delta * getTimeScale());
  });

  // A missing configured node (a typo'd `modelNode` in the level config) must
  // not render an empty body — fall back to the stand-in mesh.
  if (!object) return fallback;
  return <primitive object={object} />;
};

ModelAnimationBody.displayName = "ModelAnimationBody";
