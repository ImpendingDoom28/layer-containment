import { FC, useMemo } from "react";

import { Icon } from "../ui/Icon";
import { UICard, UICardContent, UICardHeader } from "../ui/UICard";
import { UITypography } from "../ui/UITypography";
import { GUIWrapper } from "./GUIWrapper";
import {
  bossSelector,
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
import { EnemyConfig, EnemyType } from "../../core/types/game";
import { useTranslationInCanvas } from "../../core/i18n/useTranslationInCanvas";
import { bossHealthForWave, isBossWave } from "../../utils/bossHp";
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

type BossPreviewRowProps = {
  name: string;
  health: number;
  t: ReturnType<typeof useTranslationInCanvas>;
};

const BossPreviewRow: FC<BossPreviewRowProps> = ({ name, health, t }) => (
  <div className="flex items-center gap-2 border border-red-500/60 bg-red-500/10 px-2 py-1.5">
    <Icon name="Skull" color="red3" size={16} className="shrink-0" />
    <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
      <UITypography
        variant="small"
        className="min-w-0 truncate font-semibold text-red-300"
      >
        {name}
      </UITypography>
      <UITypography
        variant="verySmall"
        className="shrink-0 font-semibold text-red-300"
      >
        {t("nextWavePreview.bossHealth", { health })}
      </UITypography>
    </div>
  </div>
);

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
  const boss = useLevelStore(bossSelector);

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

  // Mirrors the spawn queue: Reinforcements scales the group counts *and* the
  // spawn cap, then each group's enemies are resolved to a portal — an
  // explicit `pathIndex`, or an even round-robin over all portals when the
  // group names none. Only the enemies that actually come out of this portal
  // are listed, so what the player sees is what spawns.
  const portalGroups = useMemo(() => {
    if (!nextWaveConfig) return [];
    const { groups } = applyEnemyUpgradeCounts(
      nextWaveConfig.enemies,
      levelEnemyUpgradeStack,
      enemyUpgrades,
      nextWaveConfig.totalEnemies
    );
    const portalCount = pathWaypoints.length;
    const byType = new Map<EnemyType, number>();
    for (const group of groups) {
      let countHere: number;
      if (group.pathIndex !== undefined) {
        // A named portal: the whole group is only there (or nowhere).
        if (group.pathIndex !== pathIndex) continue;
        countHere = group.count;
      } else if (portalCount > 1) {
        // Even split, mirroring the spawn queue: the k-th enemy of the group
        // takes portal `k % portalCount`, so the first `count % portalCount`
        // portals get one extra.
        const base = Math.floor(group.count / portalCount);
        const remainder = group.count % portalCount;
        countHere = base + (pathIndex < remainder ? 1 : 0);
      } else {
        countHere = group.count;
      }
      if (countHere > 0) {
        byType.set(group.type, (byType.get(group.type) ?? 0) + countHere);
      }
    }
    return Array.from(byType, ([type, count]) => ({ type, count }));
  }, [
    nextWaveConfig,
    levelEnemyUpgradeStack,
    enemyUpgrades,
    pathWaypoints,
    pathIndex,
  ]);

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

  const nextWaveNumber = currentWave + 1;
  const isNextBossWave = isBossWave(boss, nextWaveNumber);
  const nextBossHealth = bossHealthForWave(boss, nextWaveNumber);

  if (!shouldShow || !nextWaveConfig || portalGroups.length === 0) return null;

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
            {isNextBossWave && (
              <BossPreviewRow name={boss!.name} health={nextBossHealth} t={t} />
            )}
            <div className="flex flex-col gap-1.5">
              {portalGroups.map(({ type, count }, index) => {
                const enemyConfig = enemyTypes?.[type];
                if (!enemyConfig) return null;

                const isDiscovered = discoveredEnemies.includes(type);

                return (
                  <EnemyPreviewModel
                    key={`${type}-${index}`}
                    enemyConfig={enemyConfig}
                    name={
                      isDiscovered
                        ? t(`enemies.${type}.name`)
                        : t("almanac.undiscoveredName")
                    }
                    count={count}
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
