import { FC } from "react";

import type { GameStatus } from "../../core/types/game";
import { HUDWrapper } from "./HUDWrapper";
import { useHudStatsState } from "./useHudPanels";
import {
  hudThemeSelector,
  useHudThemeStore,
  type HudThemeId,
} from "../../core/stores/useHudThemeStore";
import { StatsCommand } from "./themes/StatsCommand";
import { StatsHologram } from "./themes/StatsHologram";
import { StatsTactical } from "./themes/StatsTactical";
import { StatsArcade } from "./themes/StatsArcade";
import { StatsGlass } from "./themes/StatsGlass";

type HUDGameStatsProps = {
  money: number;
  health: number;
  currentWave: number;
  remainingEnemies: number;
  gameStatus: GameStatus;
  onStartWave: () => void;
};

const STATS_THEMES: Record<
  HudThemeId,
  FC<{ stats: ReturnType<typeof useHudStatsState> }>
> = {
  command: StatsCommand,
  hologram: StatsHologram,
  tactical: StatsTactical,
  arcade: StatsArcade,
  glass: StatsGlass,
};

/**
 * Where the stats live on screen, per theme. Command is the original
 * top-right card; the other themes move the readout into a bottom console
 * (hologram), a top command bar (tactical), a top-center scoreboard
 * (arcade) or a floating glass sheet (glass).
 */
const STATS_WRAPPER: Record<HudThemeId, string> = {
  // Command matches the original master box exactly (e2e depends on it).
  command: "bottom-auto left-auto w-80 top-4 right-4",
  // Full-width bottom console strip.
  hologram: "top-auto bottom-0 left-0 right-0 flex justify-center",
  // Top command strip, leaving the right ops column clear.
  tactical: "top-0 bottom-auto left-0 right-80 max-w-3xl flex justify-center",
  // Top-center scoreboard; wrapper spans the top edge and centers it.
  arcade: "top-3 bottom-auto left-0 right-0 flex justify-center",
  // Floating glass sheet, bottom-left.
  glass: "top-auto right-auto bottom-5 left-5 w-96",
};

const STATS_CHROME: Record<HudThemeId, string> = {
  command: "ui-menu-tilt ui-menu-tilt-right flex h-full w-full flex-col",
  hologram:
    "hud-holo-console hud-scanlines flex w-full flex-col overflow-hidden",
  tactical:
    "hud-tactical-topbar hud-hazard-top hud-hazard-bottom flex w-full flex-col",
  arcade: "hud-arcade-scoreboard flex w-fit flex-col",
  glass: "hud-glass-sheet hud-aurora flex h-full w-full flex-col",
};

export const HUDGameStats: FC<HUDGameStatsProps> = (props) => {
  const theme = useHudThemeStore(hudThemeSelector);
  const stats = useHudStatsState({
    money: props.money,
    health: props.health,
    currentWave: props.currentWave,
    remainingEnemies: props.remainingEnemies,
    isPaused: props.gameStatus === "paused",
    onStartWave: props.onStartWave,
  });
  const StatsTheme = STATS_THEMES[theme];

  return (
    <HUDWrapper className={STATS_WRAPPER[theme]}>
      <div className={STATS_CHROME[theme]}>
        <StatsTheme stats={stats} />
      </div>
    </HUDWrapper>
  );
};
