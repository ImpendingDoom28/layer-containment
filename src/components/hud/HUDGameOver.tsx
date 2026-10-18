import {
  FC,
  useEffect,
  useState,
  type AnimationEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { EnemyType, GameStatus, TowerType } from "../../core/types/game";
import type { RunStatsSnapshot } from "../../core/ecs/selectors/runStats";
import { UIButton } from "../ui/buttons/UIButton";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import { UIMoney } from "../ui/UIMoney";
import { UITypography } from "../ui/UITypography";
import { cn } from "../ui/lib/twUtils";
import { HUDOverlay } from "./HUDOverlay";

const TOWER_TYPES: TowerType[] = [
  "basic",
  "slow",
  "aoe",
  "laser",
  "relay",
  "chain",
];
const ENEMY_TYPES: EnemyType[] = ["basic", "fast", "tank", "medic"];

type HUDGameOverProps = {
  gameStatus: GameStatus;
  currentWave: number;
  money: number;
  enemiesKilled: number;
  stats: RunStatsSnapshot;
  onRestart: () => void;
  onGoToMainMenu: () => void;
};

export const HUDGameOver: FC<HUDGameOverProps> = ({
  gameStatus,
  currentWave,
  money,
  enemiesKilled,
  stats,
  onRestart,
  onGoToMainMenu,
}) => {
  const { t } = useTranslation();

  // Keep the overlay mounted through its exit animation: `hasOpened` stays
  // true while the card slides out, then everything resets and it unmounts.
  const [hasOpened, setHasOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  // The game keeps running while the result screen animates out (status flips
  // to "playing" or "menu"); remember the final stats and outcome so they
  // stay stable during the exit.
  const [frozen, setFrozen] = useState({
    currentWave,
    money,
    enemiesKilled,
    stats,
    isWin: false,
  });

  const isEnd = gameStatus === "gameOver" || gameStatus === "won";

  useEffect(() => {
    if (isEnd) {
      setFrozen({
        currentWave,
        money,
        enemiesKilled,
        stats,
        isWin: gameStatus === "won",
      });
      setHasOpened(true);
      setClosing(false);
    } else if (hasOpened) {
      setClosing(true);
    }
  }, [isEnd, hasOpened, gameStatus, currentWave, money, enemiesKilled, stats]);

  const handleCardAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    // Only the card's own exit animation unmounts the overlay (child
    // animations bubble up, so check the target).
    if (event.target === event.currentTarget && event.animationName === "exit") {
      setHasOpened(false);
      setClosing(false);
    }
  };

  if (!hasOpened) return null;

  const { isWin } = frozen;
  const runStats = frozen.stats;

  // Only tower types that actually did something (spent, dealt damage, or
  // got kills) appear in the table.
  const activeTowerTypes = TOWER_TYPES.filter((towerType) => {
    const damage = runStats.damageByTowerType[towerType] ?? 0;
    const spend = runStats.spendByTowerType[towerType] ?? 0;
    const kills = Object.values(
      runStats.killsByTowerType[towerType] ?? {}
    ).reduce((sum, count) => sum + count, 0);
    return damage > 0 || spend > 0 || kills > 0;
  });

  const totalKillsByTower = (towerType: TowerType): number =>
    Object.values(runStats.killsByTowerType[towerType] ?? {}).reduce(
      (sum, count) => sum + count,
      0
    );

  return (
    <HUDOverlay
      className={cn(closing && "pointer-events-none")}
      contentClassName={cn(closing && "pointer-events-none")}
    >
      <UICard
        className={cn(
          closing
            ? "animate-out fade-out slide-out-to-bottom-10 duration-200 ease-in"
            : "animate-in fade-in slide-in-from-bottom-10 zoom-in-95 duration-300 ease-out"
        )}
        onAnimationEnd={handleCardAnimationEnd}
      >
        <UICardHeader className="space-y-4">
          <UICardTitle className="justify-center">
            <UITypography
              variant="h1"
              className={isWin ? "text-green-400" : "text-red-400"}
            >
              {isWin ? t("gameOver.victory") : t("gameOver.gameOver")}
            </UITypography>
          </UICardTitle>
          {isWin && (
            <div className="p-4 text-center rounded bg-green-900/50">
              <UITypography variant="small" className="text-green-300">
                {t("gameOver.victoryMessage")}
              </UITypography>
            </div>
          )}

          {!isWin && (
            <div className="p-4 text-center rounded bg-red-900/50">
              <UITypography variant="small" className="text-red-300">
                {t("gameOver.defeatMessage")}
              </UITypography>
            </div>
          )}
        </UICardHeader>

        <UICardContent className="gap-4">
          <div className="flex flex-row items-center justify-center gap-4">
            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.finalMoney")}
              </UITypography>
              <div className="flex items-center justify-center">
                <UIMoney money={frozen.money} variant="h3" iconSize={20} />
              </div>
            </div>

            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.totalEarned")}
              </UITypography>
              <div className="flex items-center justify-center">
                <UIMoney money={runStats.totalEarned} variant="h3" iconSize={20} />
              </div>
            </div>

            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.enemiesKilled")}
              </UITypography>
              <UITypography variant="h3">{frozen.enemiesKilled}</UITypography>
            </div>
            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.wavesSurvived")}
              </UITypography>
              <UITypography variant="h3">{frozen.currentWave} / 7</UITypography>
            </div>
          </div>

          {activeTowerTypes.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="py-1 pr-3 font-medium">
                      {t("gameOver.statTowerType")}
                    </th>
                    <th className="py-1 px-3 font-medium text-right">
                      {t("gameOver.statDamage")}
                    </th>
                    <th className="py-1 px-3 font-medium text-right">
                      {t("gameOver.statSpent")}
                    </th>
                    <th className="py-1 px-3 font-medium text-right">
                      {t("gameOver.statKills")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {activeTowerTypes.map((towerType) => {
                    const killsByEnemy = runStats.killsByTowerType[towerType] ?? {};
                    const breakdown = ENEMY_TYPES.filter(
                      (enemyType) => (killsByEnemy[enemyType] ?? 0) > 0
                    )
                      .map(
                        (enemyType) =>
                          `${t(`enemies.${enemyType}.name`)} ×${killsByEnemy[enemyType]}`
                      )
                      .join(" · ");

                    return (
                      <tr key={towerType} className="border-t border-white/10">
                        <td className="py-1 pr-3">
                          {t(`towers.${towerType}.name`)}
                        </td>
                        <td className="py-1 px-3 text-right">
                          {runStats.damageByTowerType[towerType] ?? 0}
                        </td>
                        <td className="py-1 px-3 text-right">
                          <UIMoney
                            money={runStats.spendByTowerType[towerType] ?? 0}
                            variant="small"
                            iconSize={12}
                            className="inline-flex"
                          />
                        </td>
                        <td className="py-1 px-3 text-right">
                          <span className="inline-flex flex-col items-end">
                            <span>{totalKillsByTower(towerType)}</span>
                            {breakdown && (
                              <span className="text-xs text-muted-foreground">
                                {breakdown}
                              </span>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </UICardContent>

        <UICardFooter className="flex flex-row justify-end gap-3">
          <UIButton onClick={onGoToMainMenu} variant={"ghost"}>
            {t("gameOver.goToMainMenu")}
          </UIButton>
          <UIButton onClick={onRestart}>{t("gameOver.playAgain")}</UIButton>
        </UICardFooter>
      </UICard>
    </HUDOverlay>
  );
};
