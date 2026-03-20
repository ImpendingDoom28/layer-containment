import { FC, useMemo } from "react";

import { UICard, UICardContent, UICardHeader } from "../ui/UICard";
import { UITypography } from "../ui/UITypography";
import { GUIWrapper } from "./GUIWrapper";
import {
  currentWaveSelector,
  pathWaypointsSelector,
  totalWavesSelector,
  useLevelStore,
  waveConfigsSelector,
} from "../../core/stores/useLevelStore";
import {
  enemyTypesSelector,
  enemyUpgradesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  selectedUpgradesSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import { EnemyConfig } from "../../core/types/game";

type EnemyPreviewModelProps = {
  enemyConfig: EnemyConfig;
  count: number;
};

const EnemyPreviewModel: FC<EnemyPreviewModelProps> = ({
  enemyConfig,
  count,
}) => {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border border-border/70 bg-muted/35 px-2 py-1.5">
      <UITypography
        variant="verySmall"
        className="min-w-9 text-muted-foreground uppercase tracking-[0.16em]"
      >
        x{count}
      </UITypography>
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15"
          style={{ backgroundColor: enemyConfig.color }}
        />
        <UITypography variant="small" className="truncate font-medium">
          {enemyConfig.name}
        </UITypography>
      </div>
      <UITypography variant="verySmall" className="text-muted-foreground">
        unit{count > 1 ? "s" : ""}
      </UITypography>
    </div>
  );
};

type GUINextWavePreviewProps = {
  timeUntilNextWave: number | null;
  pathIndex: number;
};

export const GUINextWavePreview: FC<GUINextWavePreviewProps> = ({
  timeUntilNextWave,
  pathIndex,
}) => {
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const totalWaves = useLevelStore(totalWavesSelector);
  const waveConfigs = useLevelStore(waveConfigsSelector);
  const currentWave = useLevelStore(currentWaveSelector);

  const enemyTypes = useGameStore(enemyTypesSelector);
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);

  const selectedUpgrades = useUpgradeStore(selectedUpgradesSelector);

  const totalRewardMultiplier = useMemo(() => {
    if (!enemyUpgrades || selectedUpgrades.length === 0) return 1;
    return selectedUpgrades.reduce((acc, upgradeId) => {
      const upgrade = enemyUpgrades[upgradeId];
      return acc * (upgrade?.rewardMultiplier ?? 1);
    }, 1);
  }, [selectedUpgrades, enemyUpgrades]);

  const bonusPercentage = useMemo(() => {
    return Math.round((totalRewardMultiplier - 1) * 100);
  }, [totalRewardMultiplier]);

  const shouldShow = useMemo(() => {
    return (
      timeUntilNextWave !== null &&
      timeUntilNextWave > 0 &&
      currentWave > 0 &&
      currentWave < totalWaves
    );
  }, [timeUntilNextWave, currentWave, totalWaves]);

  const nextWaveConfig = useMemo(() => {
    if (!shouldShow) return null;
    const nextWaveIndex = currentWave;
    return waveConfigs[nextWaveIndex];
  }, [shouldShow, currentWave, waveConfigs]);

  const worldPosition = useMemo(() => {
    const path = pathWaypoints[pathIndex];
    const startPosition = path?.[0];
    const nextPosition = path?.[1];

    if (!startPosition) {
      return [0, 0, 0] as [number, number, number];
    }

    const directionX =
      (nextPosition?.x ?? startPosition.x + 1) - startPosition.x;
    const directionZ = (nextPosition?.z ?? startPosition.z) - startPosition.z;
    const directionLength = Math.hypot(directionX, directionZ) || 1;
    const sideOffsetX = (-directionZ / directionLength) * 1.1;
    const sideOffsetZ = (directionX / directionLength) * 1.1;

    return [
      startPosition.x + sideOffsetX,
      startPosition.y + 1.25,
      startPosition.z + sideOffsetZ,
    ] as [number, number, number];
  }, [pathIndex, pathWaypoints]);

  if (!shouldShow || !nextWaveConfig) return null;

  return (
    <group position={worldPosition}>
      <GUIWrapper position={[0, 0.45, 0]} distanceFactor={12}>
        <UICard
          size="sm"
          className="w-52 border border-border/80 bg-card/95 shadow-panel backdrop-blur-sm"
        >
          <UICardHeader className="gap-1 border-b border-border/70">
            <UITypography
              variant="verySmall"
              className="text-primary uppercase tracking-[0.22em]"
            >
              Path Entrance
            </UITypography>
            <div className="flex items-center justify-between gap-3">
              <UITypography variant="medium" className="font-semibold">
                Next Wave
              </UITypography>
              <UITypography
                variant="verySmall"
                className="shrink-0 text-muted-foreground uppercase tracking-[0.16em]"
              >
                {Math.ceil(timeUntilNextWave / 1000)}s
              </UITypography>
            </div>
          </UICardHeader>
          <UICardContent className="gap-2">
            <div className="flex flex-col gap-1.5">
              {nextWaveConfig.enemies.map((enemyGroup, index) => {
                const enemyConfig = enemyTypes?.[enemyGroup.type];
                if (!enemyConfig) return null;

                return (
                  <EnemyPreviewModel
                    key={`${enemyGroup.type}-${index}`}
                    enemyConfig={enemyConfig}
                    count={enemyGroup.count}
                  />
                );
              })}
            </div>

            {selectedUpgrades.length > 0 && enemyUpgrades && (
              <div className="border-t border-border/70 pt-2">
                <div className="flex items-center justify-between gap-2">
                  <UITypography
                    variant="verySmall"
                    className="text-primary uppercase tracking-[0.16em]"
                  >
                    Empowered
                  </UITypography>
                  {bonusPercentage > 0 && (
                    <UITypography
                      variant="verySmall"
                      className="text-green-400"
                    >
                      +{bonusPercentage}% gold
                    </UITypography>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selectedUpgrades.map((upgradeId) => {
                    const upgrade = enemyUpgrades[upgradeId];
                    if (!upgrade) return null;
                    return (
                      <UITypography
                        key={upgradeId}
                        variant="verySmall"
                        className="px-1.5 py-1 font-medium uppercase tracking-[0.14em] text-black"
                        style={{
                          backgroundColor: upgrade.indicatorColor,
                        }}
                      >
                        {upgrade.name}
                      </UITypography>
                    );
                  })}
                </div>
              </div>
            )}
          </UICardContent>
        </UICard>
      </GUIWrapper>
    </group>
  );
};
