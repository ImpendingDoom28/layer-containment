import { FC, MouseEvent as ReactMouseEvent, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";

import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
import type { Tower as TowerInstance } from "../../core/types/game";
import { useTranslationInCanvas } from "../../core/i18n/useTranslationInCanvas";
import {
  towerBaseRadiusSelector,
  towerHeightSelector,
  towerSellPriceMultiplierSelector,
  tileSizeSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  gridSizeSelector,
  towersSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../utils/planetSurfaceMapping";
import { UIHoldButton } from "../ui/buttons/UIHoldButton";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
} from "../ui/UICard";
import { UITable, UITableCell, UITableRow } from "../ui/UITable";
import { UITypography } from "../ui/UITypography";
import { GUIWrapper } from "./GUIWrapper";

type GUITowerInfoPanelProps = {
  tower: TowerInstance;
  onSell: () => void;
};

export const GUITowerInfoPanel: FC<GUITowerInfoPanelProps> = ({
  tower,
  onSell,
}) => {
  const t = useTranslationInCanvas();
  const towerSellPriceMultiplier = useGameStore(
    towerSellPriceMultiplierSelector
  );
  const towerTypes = useGameStore(towerTypesSelector);
  const towers = useLevelStore(towersSelector);
  const towerHeight = useGameStore(towerHeightSelector);
  const towerBaseRadius = useGameStore(towerBaseRadiusSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const gridSize = useLevelStore(gridSizeSelector);

  const sellPrice = Math.floor(tower.cost * towerSellPriceMultiplier);

  const stats = useMemo(() => {
    if (tower.type === "relay") {
      const tpl = towerTypes?.relay;
      const damagePct = (tpl?.relayNeighborDamageBonusFraction ?? 0) * 100;
      const rangePct = (tpl?.relayNeighborRangeBonusFraction ?? 0) * 100;
      return [
        { label: t("towerInfo.role"), value: t("towerInfo.support") },
        {
          label: t("towerInfo.neighborBuff"),
          value: t("towerInfo.neighborBuffValue", {
            damage: damagePct.toFixed(0),
            range: rangePct.toFixed(0),
          }),
        },
        { label: t("towerInfo.adjacency"), value: t("towerInfo.fourNeighbor") },
      ];
    }

    const effective = towerTypes
      ? getEffectiveTowerCombatStats(tower, towers, towerTypes)
      : { damage: tower.damage, range: tower.range };

    return [
      { label: t("towerInfo.damage"), value: effective.damage.toFixed(1) },
      { label: t("towerInfo.range"), value: effective.range.toFixed(1) },
      {
        label: t("towerInfo.fireRate"),
        value: `${tower.fireRate.toFixed(1)}s`,
      },
    ];
  }, [tower, towerTypes, towers, t]);

  const footing = useMemo(() => {
    const { surfacePoint, normal } = flatFieldToSphereSurface(
      tower.x,
      tower.z,
      getPlanetRadius(gridSize, tileSize)
    );
    return {
      position: surfacePoint,
      quaternion: getSurfaceQuaternion(normal),
    };
  }, [tower.x, tower.z, gridSize, tileSize]);

  // Mirrors the Tower entity's geometry: base (0.3H) + body (0.7H) + top.
  // The body is a fixed towerHeight; topScale only scales the top, so keep
  // the body contribution unscaled to match Tower.tsx.
  const towerTopY = useMemo(() => {
    const topScale = tower.topScale ?? 1;
    switch (tower.topShape ?? "cone") {
      case "cone":
        return towerHeight + towerHeight * 0.3 * topScale;
      case "sphere":
        return towerHeight + towerBaseRadius * 0.8 * topScale;
      case "cylinder":
        return towerHeight + towerHeight * 0.2 * topScale;
      case "coil":
        return towerHeight + towerHeight * 0.25 * topScale;
      default:
        return towerHeight + towerHeight * 0.1 * topScale;
    }
  }, [tower.topShape, tower.topScale, towerHeight, towerBaseRadius]);

  const onStopPropagation = (
    event:
      | ThreeEvent<MouseEvent>
      | ThreeEvent<PointerEvent>
      | ReactMouseEvent<HTMLDivElement | HTMLButtonElement>
  ) => {
    event.stopPropagation();
  };

  return (
    <group
      position={footing.position}
      quaternion={footing.quaternion}
      onClick={onStopPropagation}
      onPointerDown={onStopPropagation}
    >
      <GUIWrapper position={[0, towerTopY + 0.15, 0]} distanceFactor={11}>
        {/* drei centers this element on the anchor point; shifting it up by
            half its height puts its bottom edge there, so the panel floats
            above the tower instead of covering it. */}
        <div
          className="pointer-events-auto w-64"
          style={{ transform: "translateY(-50%)" }}
          onPointerDown={onStopPropagation}
        >
          <UICard
            size="sm"
            className="border border-border/80 bg-card/95 shadow-panel backdrop-blur-sm"
          >
            <UICardHeader className="border-b border-border/70">
              <UITypography variant="medium" className="font-semibold">
                {t(`towers.${tower.type}.name`)}
              </UITypography>
            </UICardHeader>

            <UICardContent>
              <UITable>
                {stats.map((stat) => (
                  <UITableRow
                    key={stat.label}
                    className="border-b border-border/50 last:border-b-0"
                  >
                    <UITableCell
                      align="left"
                      variant="verySmall"
                      className="text-muted-foreground uppercase tracking-[0.1em]"
                    >
                      {stat.label}
                    </UITableCell>
                    <UITableCell
                      align="right"
                      variant="small"
                      className="font-semibold"
                    >
                      {stat.value}
                    </UITableCell>
                  </UITableRow>
                ))}
              </UITable>
            </UICardContent>

            <UICardFooter className="p-0 border-border/70">
              <UIHoldButton
                onConfirm={onSell}
                label={t("towerInfo.sell", { price: sellPrice })}
                holdingLabel={t("towerInfo.selling")}
                variant="destructive"
                size="sm"
                className="w-full h-8 border-0"
              />
            </UICardFooter>
          </UICard>
        </div>
      </GUIWrapper>
    </group>
  );
};
