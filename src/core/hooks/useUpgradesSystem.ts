import { useCallback, useMemo } from "react";

import type { EnemyUpgradeId } from "../types/game";
import {
  confirmEnemyUpgradePickSelector,
  pendingEnemyUpgradeGateSelector,
  useUpgradeStore,
} from "../stores/useUpgradeStore";

export const useUpgradesSystem = () => {
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
    },
    [confirmEnemyUpgradePick]
  );

  return {
    showUpgradePanel,
    onEnemyUpgradePick,
  };
};
