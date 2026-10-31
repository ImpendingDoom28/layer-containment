import {
  FC,
  useEffect,
  useState,
  type AnimationEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { EnemyType, GameStatus, TowerType } from "../../core/types/game";
import type { RunStatsSnapshot } from "../../core/ecs/selectors/runStats";
import {
  enemyTypesSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  totalWavesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { UIButton } from "../ui/buttons/UIButton";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import { UIMoney } from "../ui/UIMoney";
import { UITable, UITableCell, UITableRow } from "../ui/UITable";
import { UITypography } from "../ui/UITypography";
import { cn } from "../ui/lib/twUtils";
import { HUDOverlay } from "./HUDOverlay";

// Damage totals grow into the thousands over a full run; trim them so the
// stats table stays readable (980 -> "980", 1234 -> "1.2k", 45678 -> "46k").
const formatDamage = (damage: number): string => {
  if (damage < 1000) return String(Math.round(damage));
  if (damage < 10000) return `${(damage / 1000).toFixed(1)}k`;
  return `${Math.round(damage / 1000)}k`;
};

type HUDGameOverProps = {
  gameStatus: GameStatus;
  currentWave: number;
  money: number;
  enemiesKilled: number;
  stats: RunStatsSnapshot;
  onRestart: () => void;
  onGoToMainMenu: () => void;
  /**
   * Starts the level after the current one. Offered on a win only when the
   * caller supplies a handler (i.e. the current level is not the last one).
   */
  onNextLevel?: () => void | Promise<void>;
};

export const HUDGameOver: FC<HUDGameOverProps> = ({
  gameStatus,
  currentWave,
  money,
  enemiesKilled,
  stats,
  onRestart,
  onGoToMainMenu,
  onNextLevel,
}) => {
  const { t } = useTranslation();

  // Tower/enemy types come from the game config, so new types added there
  // show up in the stats table automatically.
  const towerTypes = useGameStore(towerTypesSelector);
  const enemyTypes = useGameStore(enemyTypesSelector);
  const totalWaves = useLevelStore(totalWavesSelector);

  // Keep the overlay mounted through its exit animation: `hasOpened` stays
  // true while the card slides out, then everything resets and it unmounts.
  const [hasOpened, setHasOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  // The game keeps running while the result screen animates out (status flips
  // to "playing" or "menu"); remember the final stats and outcome so they
  // stay stable during the exit.
  const [frozen, setFrozen] = useState({
    currentWave,
    totalWaves,
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
        totalWaves,
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
  }, [
    isEnd,
    hasOpened,
    gameStatus,
    currentWave,
    totalWaves,
    money,
    enemiesKilled,
    stats,
  ]);

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

  // Types come from the config so new tower/enemy types appear automatically.
  const allTowerTypes = Object.keys(towerTypes ?? {}) as TowerType[];
  const allEnemyTypes = Object.keys(enemyTypes ?? {}) as EnemyType[];

  const totalKillsByTower = (towerType: TowerType): number =>
    Object.values(runStats.killsByTowerType[towerType] ?? {}).reduce(
      (sum, count) => sum + count,
      0
    );

  // Only tower types that actually did something (spent, dealt damage, or
  // got kills) appear in the table.
  const activeTowerTypes = allTowerTypes.filter((towerType) => {
    const damage = runStats.damageByTowerType[towerType] ?? 0;
    const spend = runStats.spendByTowerType[towerType] ?? 0;
    return damage > 0 || spend > 0 || totalKillsByTower(towerType) > 0;
  });

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
          <div className="flex flex-row flex-wrap items-center justify-center gap-4">
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
              <UITypography variant="h3">
                {frozen.currentWave} / {frozen.totalWaves}
              </UITypography>
            </div>
          </div>

          {activeTowerTypes.length > 0 && (
            <div className="overflow-x-auto">
              <UITable
                className="text-sm"
                headers={[
                  t("gameOver.statTowerType"),
                  t("gameOver.statDamage"),
                  t("gameOver.statSpent"),
                  t("gameOver.statKills"),
                ]}
              >
                {activeTowerTypes.map((towerType) => {
                  const killsByEnemy =
                    runStats.killsByTowerType[towerType] ?? {};
                  const breakdown = allEnemyTypes
                    .filter((enemyType) => (killsByEnemy[enemyType] ?? 0) > 0)
                    .map(
                      (enemyType) =>
                        `${t(`enemies.${enemyType}.name`)} ×${killsByEnemy[enemyType]}`
                    )
                    .join(" · ");

                  return (
                    <UITableRow key={towerType} className="border-t border-white/10">
                      <UITableCell>{t(`towers.${towerType}.name`)}</UITableCell>
                      <UITableCell align="right">
                        {formatDamage(
                          runStats.damageByTowerType[towerType] ?? 0
                        )}
                      </UITableCell>
                      <UITableCell align="right" plain>
                        <UIMoney
                          money={runStats.spendByTowerType[towerType] ?? 0}
                          variant="small"
                          iconSize={12}
                          className="inline-flex"
                        />
                      </UITableCell>
                      <UITableCell align="right" plain>
                        <span className="inline-flex flex-col items-end">
                          <UITypography variant="medium" as="span">
                            {totalKillsByTower(towerType)}
                          </UITypography>
                          {breakdown && (
                            <UITypography
                              variant="small"
                              as="span"
                              className="text-muted-foreground"
                            >
                              {breakdown}
                            </UITypography>
                          )}
                        </span>
                      </UITableCell>
                    </UITableRow>
                  );
                })}
              </UITable>
            </div>
          )}
        </UICardContent>

        <UICardFooter className="flex flex-row flex-wrap justify-end gap-3">
          <UIButton onClick={onGoToMainMenu} variant={"ghost"}>
            {t("gameOver.goToMainMenu")}
          </UIButton>
          {/* "Next Level" takes the primary slot on a win; "Play Again" steps
              back to outline so there is a single clear call to action. */}
          <UIButton
            onClick={onRestart}
            variant={isWin && onNextLevel ? "outline" : "default"}
          >
            {t("gameOver.playAgain")}
          </UIButton>
          {isWin && onNextLevel && (
            <UIButton onClick={() => void onNextLevel()}>
              {t("gameOver.nextLevel")}
            </UIButton>
          )}
        </UICardFooter>
      </UICard>
    </HUDOverlay>
  );
};
