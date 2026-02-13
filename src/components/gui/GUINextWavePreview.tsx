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
    <div className="flex flex-row items-center gap-1 p-1.5 bg-gray-800 rounded shadow-lg bg-opacity-90">
      <span className="w-4 text-xs font-semibold text-white">x{count}</span>
      <span
        className="w-4 h-4 rounded-full"
        style={{ backgroundColor: enemyConfig.color }}
      ></span>
      <span className="text-xs font-normal text-white">{enemyConfig.name}</span>
    </div>
  );
};

type GUINextWavePreviewProps = {
  timeUntilNextWave: number | null;
};

export const GUINextWavePreview: FC<GUINextWavePreviewProps> = ({
  timeUntilNextWave,
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

  // TODO: Adjust to support multiple paths with enemies in each spawn
  const worldPosition = useMemo(() => {
    const startPosition = pathWaypoints[0][0];
    const yOffset = 1.5;

    return [startPosition.x, yOffset, startPosition.z] as [
      number,
      number,
      number,
    ];
  }, [pathWaypoints]);

  if (!shouldShow || !nextWaveConfig) return null;

  return (
    <group position={worldPosition}>
      <GUIWrapper position={[0, 0.4, 0]} distanceFactor={0.15 * 100}>
        <UICard className="w-36">
          <UICardHeader>
            <UITypography variant="small">Incoming...</UITypography>
          </UICardHeader>
          <UICardContent className="gap-1">
            <div className="flex flex-col">
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
              <div className="pt-2 mt-2 border-t border-gray-600">
                <UITypography variant="small" className="mb-1 text-yellow-400">
                  Empowered
                </UITypography>
                <div className="flex flex-wrap gap-1">
                  {selectedUpgrades.map((upgradeId) => {
                    const upgrade = enemyUpgrades[upgradeId];
                    if (!upgrade) return null;
                    return (
                      <span
                        key={upgradeId}
                        className="px-1.5 py-0.5 text-xs rounded"
                        style={{
                          backgroundColor: upgrade.indicatorColor,
                          color: "#000",
                        }}
                      >
                        {upgrade.name}
                      </span>
                    );
                  })}
                </div>
                {bonusPercentage > 0 && (
                  <UITypography variant="small" className="mt-1 text-green-400">
                    +{bonusPercentage}% gold
                  </UITypography>
                )}
              </div>
            )}
          </UICardContent>
        </UICard>
      </GUIWrapper>
    </group>
  );
};
