import { FC, useEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { DirectionalLight, PCFSoftShadowMap } from "three";

import {
  shadowsEnabledSelector,
  useSettingsStore,
} from "../../../core/stores/useSettingsStore";
import {
  gridSizeSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { isSoftwareRenderer } from "../../../core/utils/isSoftwareRenderer";

// The shadow camera's ortho box is a fixed margin around the level board, so
// one 2048px shadow map covers it at ~2px per world unit — enough for the
// soft, low-detail shadows a tower defense wants without per-tile cascades.
// The margin is generous: the light sits at an angle, so the board's projection
// along the light direction is wider than the board itself.
const SHADOW_BOX_MARGIN = 8;
const SHADOW_MAP_SIZE = 2048;

// Sky cyan dimmed down from `scene-water-emissive`, so up-facing surfaces pick
// up the same tint the skybox horizon carries; the ground bounce stays a
// neutral mid-gray.
const HEMISPHERE_SKY_COLOR = "#2b6f80";
const HEMISPHERE_GROUND_COLOR = "#4a4a52";
const RIM_LIGHT_COLOR = "#7fb4ff";

/**
 * Scene lighting: a hemisphere fill, the key light, and a cool rim light.
 *
 * The hemisphere light replaces a flat ambient: its cyan-tinted sky term
 * shades up-facing surfaces toward the skybox horizon while the gray ground
 * term keeps undersides neutral, so the fill has direction instead of
 * flattening everything.
 *
 * The key light is the only shadow caster. Its shadow map is a fixed-size
 * ortho box over the level board (sized from the level store's grid), so the
 * whole board is lit from one map. Real-time shadows are on by default and
 * toggleable in Settings → Quality; they are auto-disabled on software (CPU)
 * WebGL renderers (SwiftShader / llvmpipe — headless CI), where the shadow
 * pass would starve the main thread the same way a fullscreen bloom pass does.
 *
 * The rim light sits on the far side of the board from the default camera
 * and casts no shadow: it grazes the back/top edges of towers and enemies
 * with a dim cool blue, silhouetting them against the dark sky.
 */
export const Light: FC = () => {
  const shadowsEnabled = useSettingsStore(shadowsEnabledSelector);
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const gl = useThree((state) => state.gl);

  // One-shot probe (memoised): the rasterizer never changes at runtime.
  const softwareRenderer = useMemo(() => isSoftwareRenderer(), []);

  // Off until the level store is populated (gridSize 0 would give a
  // degenerate, zero-size shadow camera).
  const shadowsOn = shadowsEnabled && !softwareRenderer && gridSize > 0;

  // R3F only applies gl.shadowMap on mount, so keep the renderer's shadow map
  // in sync when the setting flips at runtime (and bump needsUpdate so the
  // shadow map re-renders on re-enable).
  useEffect(() => {
    gl.shadowMap.enabled = shadowsOn;
    gl.shadowMap.type = PCFSoftShadowMap;
    gl.shadowMap.needsUpdate = true;
  }, [gl, shadowsOn]);

  const halfExtent = (gridSize * tileSize) / 2 + SHADOW_BOX_MARGIN;

  // The ortho shadow camera's projection matrix is only recomputed when the
  // camera is (re)attached, so nudge it when the board size changes — R3F
  // applies the shadow-camera-* props onto the camera, but three.js needs an
  // explicit updateProjectionMatrix() to bake them into the matrix.
  const shadowLightRef = useRef<DirectionalLight>(null);
  useEffect(() => {
    const camera = shadowLightRef.current?.shadow?.camera;
    if (camera) camera.updateProjectionMatrix();
  }, [halfExtent]);

  return (
    <>
      <hemisphereLight
        args={[HEMISPHERE_SKY_COLOR, HEMISPHERE_GROUND_COLOR, 0.55]}
      />
      <directionalLight
        ref={shadowLightRef}
        name="shadow-light"
        position={[10, 16, 6]}
        intensity={1}
        castShadow={shadowsOn}
        shadow-mapSize={[SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]}
        shadow-camera-near={0.5}
        shadow-camera-far={80}
        shadow-camera-left={-halfExtent}
        shadow-camera-right={halfExtent}
        shadow-camera-top={halfExtent}
        shadow-camera-bottom={-halfExtent}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
      />
      <directionalLight
        position={[-6, 9, -14]}
        intensity={0.45}
        color={RIM_LIGHT_COLOR}
      />
    </>
  );
};

Light.displayName = "Light";
