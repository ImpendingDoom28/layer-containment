import { useFrame, useThree } from "@react-three/fiber";
import { useActions } from "koota/react";
import { useEffect, useRef } from "react";
import { enemyActions } from "../../../../core/ecs/actions/enemyActions";
import { useGameStore } from "../../../../core/stores/useGameStore";
import { useLevelStore } from "../../../../core/stores/useLevelStore";
import { useUpgradeStore } from "../../../../core/stores/useUpgradeStore";

/**
 * Exposes the three scene and renderer on `window` so external profiling
 * scripts (Playwright/CDP) can toggle named scene roots and read gl.info
 * without React. Stress-entry only.
 */
export const StressDebugBridge = () => {
  const { scene, gl } = useThree();
  const { getLivingEnemyCount } = useActions(enemyActions);
  // The default directional shadow camera only covers a ~10x10-unit patch at
  // the origin of this ~32-unit planet, so the shadow pass costs a full extra
  // render of every scene mesh for almost no visible effect. Stress run only:
  // disable it once the light has mounted.
  const shadowDisabledRef = useRef(false);
  useEffect(() => {
    const w = window as unknown as Record<string, unknown>;
    w["__stressScene"] = scene;
    w["__stressGl"] = gl;
    w["__stressGameStore"] = useGameStore;
    w["__stressLevelStore"] = useLevelStore;
    w["__stressUpgradeStore"] = useUpgradeStore;
    w["__stressLivingCount"] = getLivingEnemyCount;
  }, [scene, gl, getLivingEnemyCount]);
  useFrame(() => {
    if (shadowDisabledRef.current) return;
    const light = scene.getObjectByName("shadow-light");
    if (light) {
      (light as unknown as { castShadow: boolean }).castShadow = false;
      shadowDisabledRef.current = true;
    }
  });
  return null;
};
