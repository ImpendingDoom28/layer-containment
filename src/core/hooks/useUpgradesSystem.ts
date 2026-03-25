import { useCallback, useMemo } from "react";

import type { EnemyUpgradeId } from "../types/game";
import {
  confirmEnemyUpgradePickSelector,
  pendingEnemyUpgradeGateSelector,
  useUpgradeStore,
} from "../stores/useUpgradeStore";
import { WaveSystem } from "./useWaveSystem";

export const useUpgradesSystem = (waveSystem: WaveSystem) => {
  const { resumeCountdownAfterUpgradePick } = waveSystem;

  const pendingEnemyUpgradeGate = useUpgradeStore(
    pendingEnemyUpgradeGateSelector
  );
  const confirmEnemyUpgradePick = useUpgradeStore(
    confirmEnemyUpgradePickSelector
  );

  const showUpgradePanel = useMemo(
    () => pendingEnemyUpgradeGate,
    [pendingEnemyUpgradeGate]
  );

  const onEnemyUpgradePick = useCallback(
    (id: EnemyUpgradeId) => {
      confirmEnemyUpgradePick(id);
      resumeCountdownAfterUpgradePick();
    },
    [confirmEnemyUpgradePick, resumeCountdownAfterUpgradePick]
  );

  return {
    showUpgradePanel,
    onEnemyUpgradePick,
  };
};
