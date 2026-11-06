import {
  Suspense,
  memo,
  useEffect,
  useMemo,
  type FC,
  type ReactNode,
} from "react";
import { useGLTF } from "@react-three/drei";
import { type Object3D } from "three";

import { ModelLoadErrorBoundary } from "./ModelLoadErrorBoundary";

type ModelLoaderProps = {
  /** URL of the GLB to load (served from `public/`). */
  url: string;
  /** Name of the node inside the GLB to render (a file may hold many). */
  node: string;
  /**
   * Optional per-model transform (rescale, recenter, reorient, ...) applied
   * once to the loaded node before it is rendered. Must not mutate
   * `source` — the parsed scene is shared by every loader — and should
   * return a new object (a clone of the source is fine; geometry/materials
   * are shared, so a clone adds no GPU buffers). Pass a stable function
   * reference (module-level or `useCallback`): the result is memoized on the
   * function's identity, so an inline closure would re-run on every render.
   */
  prepare?: (source: Object3D) => Object3D;
  /** Rendered while the GLB loads (and as a permanent stand-in if it fails). */
  fallback: ReactNode;
  /**
   * Called once with the prepared object when it becomes available and again
   * with `null` on unmount (or when the object is replaced). Pass a stable
   * reference; consumers use it to reach into the scene graph (e.g. to find a
   * named sub-node) without polling.
   */
  onObjectReady?: (object: Object3D | null) => void;
};

/**
 * Generic GLB model loader: fetches `url` through the shared `useGLTF` cache
 * (one parse per URL, no matter how many instances use it), pulls out the
 * named `node`, and optionally runs it through a `prepare` transform. Without
 * `prepare` the node is cloned, so several instances never fight over the
 * same scene-graph parent. The object is isolated in its own Suspense
 * boundary so a slow load suspends only this one object, and in a small error
 * boundary so a failed load (network error, 404, parse error) renders the
 * `fallback` instead of propagating the throw and unmounting the whole scene.
 */
export const ModelLoader: FC<ModelLoaderProps> = memo(
  ({ url, node, prepare, fallback, onObjectReady }) => (
    <ModelLoadErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <ModelLoaderModel
          url={url}
          node={node}
          prepare={prepare}
          onObjectReady={onObjectReady}
        />
      </Suspense>
    </ModelLoadErrorBoundary>
  )
);

ModelLoader.displayName = "ModelLoader";

const ModelLoaderModel: FC<{
  url: string;
  node: string;
  prepare?: (source: Object3D) => Object3D;
  onObjectReady?: (object: Object3D | null) => void;
}> = ({ url, node, prepare, onObjectReady }) => {
  const gltf = useGLTF(url);
  const source = gltf.scene.getObjectByName(node);
  const object = useMemo(
    () => (source ? (prepare ? prepare(source) : source.clone(true)) : null),
    [source, prepare]
  );

  // Report the object to the consumer when it appears (or changes) and notify
  // them of the unmount with `null`, so the consumer can release its handle.
  useEffect(() => {
    if (!onObjectReady) return;
    if (!object) return;
    onObjectReady(object);
    return () => onObjectReady(null);
  }, [object, onObjectReady]);

  if (!object) return null;
  return <primitive object={object} />;
};

ModelLoaderModel.displayName = "ModelLoaderModel";
