import { useFrame } from "@react-three/fiber";
import { useGameStore } from "../../../src/core/stores/useGameStore";
import { useUpgradeStore } from "../../../src/core/stores/useUpgradeStore";

/**
 * Unattended driver: auto-picks upgrade gates, auto-starts waves, and
 * restarts the run forever after a win (or a defeat, just in case).
 */
export const StressAutoDriver = ({
  startWave,
  restart,
}: {
  startWave: () => void;
  restart: () => void;
}) => {
  useFrame(() => {
    const gameStatus = useGameStore.getState().gameStatus;

    if (gameStatus === "won" || gameStatus === "gameOver") {
      restart();
      return;
    }
    if (gameStatus !== "playing") {
      return;
    }

    const {
      pendingEnemyUpgradeGate,
      upgradeChoiceOptions,
      confirmEnemyUpgradePick,
      resetLevelEnemyUpgrades,
    } = useUpgradeStore.getState();

    if (pendingEnemyUpgradeGate && upgradeChoiceOptions.length > 0) {
      confirmEnemyUpgradePick(upgradeChoiceOptions[0]);
      return;
    }
    if (pendingEnemyUpgradeGate) {
      // Gate is open but has no options; unblock it defensively.
      resetLevelEnemyUpgrades();
      return;
    }

    // startWave() is a no-op unless the wave is actually ready to start,
    // so it is safe to call every frame.
    startWave();
  });
  return null;
};
