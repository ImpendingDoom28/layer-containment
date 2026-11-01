import { FC } from "react";

import { Bloom, EffectComposer } from "@react-three/postprocessing";

import {
  bloomEnabledSelector,
  useSettingsStore,
} from "../../../core/stores/useSettingsStore";

/**
 * Post-process chain for the 3D scenes: a single Bloom pass (mipmap blur) that
 * makes every emissive element glow — portal pulse, water, tower preview,
 * hit-flash, range rings, floating text.
 *
 * The threshold keeps only hot emissives (luminance above ~0.7 in linear
 * space); the rest of the scene renders untouched. When the setting is off the
 * composer renders nothing and R3F falls back to the plain scene render, so
 * the toggle is free. Bloom runs at half resolution to keep the cost low on
 * weak GPUs.
 */
export const PostFX: FC = () => {
  const bloomEnabled = useSettingsStore(bloomEnabledSelector);

  if (!bloomEnabled) return null;

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
