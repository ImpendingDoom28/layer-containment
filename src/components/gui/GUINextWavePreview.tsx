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
  levelEnemyUpgradeStackSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import {
  discoveredEnemiesSelector,
  useAlmanacStore,
} from "../../core/stores/useAlmanacStore";
import { EnemyConfig } from "../../core/types/game";
import { useTranslationInCanvas } from "../../core/i18n/useTranslationInCanvas";
import { applyEnemyUpgradeCounts } from "../../utils/waveEnemyCounts";
import {
  nextWaveReadySelector,
  useWaveStore,
} from "../../core/stores/useWaveStore";

type EnemyPreviewModelProps = {
  enemyConfig: EnemyConfig;
  name: string;
  count: number;
  isDiscovered: boolean;
};

const EnemyPreviewModel: FC<EnemyPreviewModelProps> = ({
  enemyConfig,
  name,
  count,
  isDiscovered,
}) => {
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-2 border border-border/70 bg-muted/35 px-2 py-1.5">
      <UITypography
        variant="verySmall"
        className="min-w-9 text-muted-foreground uppercase tracking-[0.16em]"
      >
        x{count}
      </UITypography>
      <div
        className={`flex items-center min-w-0 gap-2 ${
          !isDiscovered ? "italic text-muted-foreground" : ""
        }`}
      >
        <span
          className={`h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-white/15 ${
            !isDiscovered ? "bg-muted" : ""
          }`}
          style={
            isDiscovered ? { backgroundColor: enemyConfig.color } : undefined
          }
        />
        <UITypography variant="small" className="font-medium truncate">
          {name}
        </UITypography>
      </div>
    </div>
  );
};

type GUINextWavePreviewProps = {
  pathIndex: number;
};

export const GUINextWavePreview: FC<GUINextWavePreviewProps> = ({
  pathIndex,
}) => {
  const t = useTranslationInCanvas();
  const nextWaveReady = useWaveStore(nextWaveReadySelector);
  const pathWaypoints = useLevelStore(pathWaypointsSelector);
  const totalWaves = useLevelStore(totalWavesSelector);
  const waveConfigs = useLevelStore(waveConfigsSelector);
  const currentWave = useLevelStore(currentWaveSelector);

  const enemyTypes = useGameStore(enemyTypesSelector);
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);

  const levelEnemyUpgradeStack = useUpgradeStore(
    levelEnemyUpgradeStackSelector
  );

  const discoveredEnemies = useAlmanacStore(discoveredEnemiesSelector);

  const shouldShow = useMemo(() => {
    return nextWaveReady && currentWave > 0 && currentWave < totalWaves;
  }, [nextWaveReady, currentWave, totalWaves]);

  const nextWaveConfig = useMemo(() => {
    if (!shouldShow) return null;
    const nextWaveIndex = currentWave;
    return waveConfigs[nextWaveIndex];
  }, [shouldShow, currentWave, waveConfigs]);

  // Mirrors the spawn loop: Reinforcements scales the group counts *and* the
  // spawn cap, so the counts shown here are exactly what will spawn.
  const reinforcedGroups = useMemo(() => {
    if (!nextWaveConfig) return [];
    return applyEnemyUpgradeCounts(
      nextWaveConfig.enemies,
      levelEnemyUpgradeStack,
      enemyUpgrades,
      nextWaveConfig.totalEnemies
    ).groups;
  }, [nextWaveConfig, levelEnemyUpgradeStack, enemyUpgrades]);

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
          className="border w-52 border-border/80 bg-card/95 shadow-panel backdrop-blur-sm"
        >
          <UICardHeader className="gap-1 border-b border-border/70">
            <UITypography variant="medium" className="font-semibold">
              {t("nextWavePreview.nextWave")}
            </UITypography>
          </UICardHeader>
          <UICardContent className="gap-2">
            <div className="flex flex-col gap-1.5">
              {reinforcedGroups.map((enemyGroup, index) => {
                const enemyConfig = enemyTypes?.[enemyGroup.type];
                if (!enemyConfig) return null;

                const isDiscovered = discoveredEnemies.includes(
                  enemyGroup.type
                );

                return (
                  <EnemyPreviewModel
                    key={`${enemyGroup.type}-${index}`}
                    enemyConfig={enemyConfig}
                    name={
                      isDiscovered
                        ? t(`enemies.${enemyGroup.type}.name`)
                        : t("almanac.undiscoveredName")
                    }
                    count={enemyGroup.count}
                    isDiscovered={isDiscovered}
                  />
                );
              })}
            </div>
          </UICardContent>
        </UICard>
      </GUIWrapper>
    </group>
  );
};
