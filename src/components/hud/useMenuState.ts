import { useEffect, useState } from "react";

import {
  setShowAudioSettingsSelector,
  showAudioSettingsSelector,
  useGameStore,
} from "../../core/stores/useGameStore";

export const useMenuState = () => {
  const [hasInteracted, setHasInteracted] = useState(false);
  const [showAlmanac, setShowAlmanac] = useState(false);
  const showAudioSettings = useGameStore(showAudioSettingsSelector);
  const setShowAudioSettings = useGameStore(setShowAudioSettingsSelector);

  useEffect(() => {
    const onInteraction = () => {
      if (!hasInteracted) {
        setHasInteracted(true);
      }
    };

    globalThis.addEventListener("mousedown", onInteraction, { once: true });
    globalThis.addEventListener("keydown", onInteraction, { once: true });
    globalThis.addEventListener("touchstart", onInteraction, { once: true });

    return () => {
      globalThis.removeEventListener("mousedown", onInteraction);
      globalThis.removeEventListener("keydown", onInteraction);
      globalThis.removeEventListener("touchstart", onInteraction);
    };
  }, [hasInteracted]);

  const getActiveView = () => {
    if (showAudioSettings) return "audio" as const;
    if (showAlmanac) return "almanac" as const;
    return "menu" as const;
  };

  const activeView = getActiveView();

  return {
    hasInteracted,
    showAlmanac,
    setShowAlmanac,
    showAudioSettings,
    setShowAudioSettings,
    activeView,
  };
};
