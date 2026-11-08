import { FC, memo, useCallback, useMemo } from "react";

import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
import type {
  Tower as TowerInstance,
  TowerType,
} from "../../core/types/game";
import type { TileData } from "../../core/types/utils";
import type { TilePlacementState } from "../../utils/tilePlacement";
import { Tower } from "../entities/Tower";
import { TowerIdleAnimation } from "../entities/effects/TowerIdleAnimation";
import { GUITowerInfoPanel } from "../gui/GUITowerInfoPanel";
import {
  tileSizeSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { tileToWorldCoordinate } from "../../utils/levelEditor";
import { useGameSessionRuntime } from "./GameSessionSystem";

type TowerSystemProps = {
  selectedTower: TowerInstance | null;
  onTowerClick: ((tower: TowerInstance) => void) | null;
  onSellTower: ((towerId: number) => void) | null;
  hoveredTile: TileData | null;
  hoveredTilePlacementState: TilePlacementState | null;
  selectedTowerType: TowerType | null;
};

// Pure render layer for the towers. Turret aiming and firing live in the game
// session's combat system (`src/core/session/towerCombatSystem.ts`), which owns
// the logical per-turret yaw, the aim fire-gate, and the muzzle origin; the sim
// mirrors the yaw onto each registered turret node and reads the shot origin
// from the node's world matrix. The only render→sim bridge here is registering
// the live turret nodes (done by `Tower` through `onTurretNode`).
export const TowerSystem: FC<TowerSystemProps> = memo(
  ({
    selectedTower,
    onTowerClick,
    onSellTower,
    hoveredTile,
    selectedTowerType,
    hoveredTilePlacementState,
  }) => {
    const { registerTurretNode, hasTowerTarget } = useGameSessionRuntime();

    const towerTypes = useGameStore(towerTypesSelector);
    const tileSize = useGameStore(tileSizeSelector);
    const gridSize = useLevelStore(gridSizeSelector);
    const towers = useLevelStore(towersSelector);

    // Stable so `Tower`'s `onModelReady` callback identity does not churn on
    // every re-render (it is a dependency of that callback).
    const onTurretNode = useCallback(
      (towerId: number, node: Parameters<typeof registerTurretNode>[1]) =>
        registerTurretNode(towerId, node),
      [registerTurretNode]
    );

    const combatStatsByTowerId = useMemo(() => {
      const map = new Map<number, { damage: number; range: number }>();
      if (!towerTypes) return map;
      for (const tower of towers) {
        map.set(
          tower.id,
          getEffectiveTowerCombatStats(tower, towers, towerTypes)
        );
      }
      return map;
    }, [towers, towerTypes]);

    const previewTower = useMemo(() => {
      if (!selectedTowerType || !hoveredTile) return null;

      const towerConfig = towerTypes?.[selectedTowerType];
      if (!towerConfig) return null;
      if (!hoveredTilePlacementState || hoveredTilePlacementState.isBlocked) {
        return null;
      }

      return {
        ...towerConfig,
        id: -1,
        type: selectedTowerType,
        gridX: hoveredTile.gridX,
        gridZ: hoveredTile.gridZ,
        x: tileToWorldCoordinate(hoveredTile.gridX, gridSize, tileSize),
        z: tileToWorldCoordinate(hoveredTile.gridZ, gridSize, tileSize),
        lastFireTime: 0,
      };
    }, [
      selectedTowerType,
      hoveredTile,
      towerTypes,
      hoveredTilePlacementState,
      gridSize,
      tileSize,
    ]);

    return (
      <>
        {/* One shared frame loop for every placed tower's idle motion
            (scan / bob / emissive breathing); each Tower registers its rig
            with the driver on model load. */}
        <TowerIdleAnimation hasTowerTarget={hasTowerTarget} />
        <group name="towers">
          {towers.map((tower) => {
            const effectiveStats = combatStatsByTowerId.get(tower.id) ?? {
              damage: tower.damage,
              range: tower.range,
            };
            return (
              <Tower
                key={tower.id}
                tower={tower}
                effectiveRange={effectiveStats.range}
                isSelected={selectedTower?.id === tower.id}
                onClick={() => onTowerClick?.(tower)}
                onTurretNode={onTurretNode}
              />
            );
          })}
        </group>

        {previewTower && towerTypes && (
          <Tower
            key="preview"
            tower={previewTower}
            effectiveRange={
              getEffectiveTowerCombatStats(
                previewTower,
                [...towers, previewTower],
                towerTypes
              ).range
            }
            isPreview={true}
            isInvalidPlacement={hoveredTilePlacementState?.isOnPath ?? false}
          />
        )}

        {selectedTower && (
          <GUITowerInfoPanel
            tower={selectedTower}
            onSell={() => onSellTower?.(selectedTower.id)}
          />
        )}
      </>
    );
  }
);

TowerSystem.displayName = "TowerSystem";
