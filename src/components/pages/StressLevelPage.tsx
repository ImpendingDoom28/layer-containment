import { useCallback } from "react";
import { WorldProvider } from "koota/react";

import { HUDStressLevel } from "../hud/HUDStressLevel";
import { StressLevelScene } from "../scenes/stress/StressLevelScene";
import { EntityIdProvider } from "../../core/contexts/EntityIdContext";
import { world } from "../../core/ecs/world";

type StressLevelPageProps = {
  onBackToMenu: () => void;
};

/**
 * The stress-test scene as a top-level route (main app, hidden behind
 * `?m=debug`). The scene is self-contained (its own session, camera rig,
 * unattended driver, and live-metrics overlay); the page provides the shared
 * world and the back-to-menu HUD.
 */
export const StressLevelPage = ({ onBackToMenu }: StressLevelPageProps) => {
  const onNavigateBack = useCallback(() => {
    onBackToMenu();
  }, [onBackToMenu]);

  return (
    <div className="fixed inset-0">
      <WorldProvider world={world}>
        <EntityIdProvider>
          <StressLevelScene />
          <HUDStressLevel onBackToMenu={onNavigateBack} />
        </EntityIdProvider>
      </WorldProvider>
    </div>
  );
};
