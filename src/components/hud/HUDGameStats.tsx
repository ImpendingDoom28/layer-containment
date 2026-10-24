import { FC } from "react";

import type { GameStatus } from "../../core/types/game";
import { HUDWrapper } from "./HUDWrapper";
import { HudThemePanel, HudThemeShell } from "./hudThemePanel";
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
    <HUDWrapper className="bottom-auto left-auto w-80 top-4 right-4">
      <HudThemeShell theme={theme} side="right" className="h-full">
        <HudThemePanel theme={theme} className="flex-1">
          <StatsTheme stats={stats} />
        </HudThemePanel>
      </HudThemeShell>
    </HUDWrapper>
  );
};
