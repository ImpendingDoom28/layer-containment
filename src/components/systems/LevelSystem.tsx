import { FC, useEffect, useLayoutEffect, useRef } from "react";

import { getMaxEntityId, useLevelStore } from "../../core/stores/useLevelStore";
import {
  type LevelConfigFiles,
  loadLevelConfigFile,
} from "../../core/configs/levelConfig";
import { tileSizeSelector, useGameStore } from "../../core/stores/useGameStore";
import { useEntityIds } from "../../core/contexts/EntityIdContext";

export const LevelSystem: FC<{ levelName?: LevelConfigFiles }> = ({
  levelName,
}) => {
  const tileSize = useGameStore(tileSizeSelector);
  const {
    initializeLevelState,
    isLevelConfigLoaded,
    levelLoadError,
    levelLoadRetryToken,
    resetLevelState,
    setLevelLoadError,
  } = useLevelStore();
  const { ensureEnemyIdAtLeast } = useEntityIds();
  const loadGenerationRef = useRef(0);

  useLayoutEffect(() => {
    if (!levelName) return;

    loadGenerationRef.current += 1;
    resetLevelState();
  }, [levelName, resetLevelState]);

  useEffect(() => {
    // A failed load records `levelLoadError`, which the UI surfaces with a
    // retry; the effect re-arms when the error is cleared.
    if (!levelName || isLevelConfigLoaded || levelLoadError || tileSize <= 0)
      return;

    const generation = loadGenerationRef.current;
    let cancelled = false;

    const loadLevelData = async (): Promise<void> => {
      try {
        const levelData = await loadLevelConfigFile(levelName);
        if (cancelled || generation !== loadGenerationRef.current) return;

        initializeLevelState(levelData, tileSize);
        ensureEnemyIdAtLeast(getMaxEntityId(levelData.enemies) + 1);
      } catch (error) {
        if (cancelled || generation !== loadGenerationRef.current) return;
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(`Failed to initialize level "${levelName}".`, error);
        setLevelLoadError(message);
      }
    };

    void loadLevelData();

    return () => {
      cancelled = true;
      if (generation === loadGenerationRef.current) {
        loadGenerationRef.current += 1;
      }
    };
  }, [
    ensureEnemyIdAtLeast,
    initializeLevelState,
    isLevelConfigLoaded,
    levelLoadError,
    levelLoadRetryToken,
    levelName,
    setLevelLoadError,
    tileSize,
  ]);

  return null;
};
