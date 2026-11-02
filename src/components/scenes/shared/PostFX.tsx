import { FC, useMemo } from "react";

import { Bloom, EffectComposer } from "@react-three/postprocessing";

import {
  bloomEnabledSelector,
  useSettingsStore,
} from "../../../core/stores/useSettingsStore";
import { isSoftwareRenderer } from "../../../core/utils/isSoftwareRenderer";

/**
 * Post-process chain for the 3D scenes: a single Bloom pass (mipmap blur) that
 * makes every emissive element glow — portal pulse, water, tower preview,
 * hit-flash, range rings, floating text.
 *
 * The threshold keeps only hot emissives (luminance above ~0.7 in linear
 * space); the rest of the scene renders untouched. Bloom runs at half
 * resolution to keep the cost low on weak GPUs.
 *
 * It renders only when the setting is on *and* the WebGL context is a real
 * GPU: on software renderers (SwiftShader / llvmpipe — headless CI, older
 * hardware) a fullscreen bloom pass starves the main thread, so it is
 * auto-skipped there and the plain scene render is used instead. When it
 * doesn't render, R3F falls back to the plain scene render, so both exits are
 * free.
 */
export const PostFX: FC = () => {
  const bloomEnabled = useSettingsStore(bloomEnabledSelector);

  // One-shot probe (memoised): the rasterizer never changes at runtime.
  const softwareRenderer = useMemo(() => isSoftwareRenderer(), []);

  if (!bloomEnabled || softwareRenderer) return null;

  return (
    <EffectComposer multisampling={4}>
      <Bloom
        luminanceThreshold={0.7}
        luminanceSmoothing={0.25}
        mipmapBlur
        radius={0.65}
        intensity={0.9}
        resolutionScale={0.5}
      />
    </EffectComposer>
  );
};
