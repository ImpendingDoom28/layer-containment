import { FC, MouseEvent as ReactMouseEvent, useMemo } from "react";
import type { ThreeEvent } from "@react-three/fiber";

import { getEffectiveTowerCombatStats } from "../../core/relayBuffs";
import type { Tower as TowerInstance } from "../../core/types/game";
import { useTranslationInCanvas } from "../../core/i18n/useTranslationInCanvas";
import {
  towerSellPriceMultiplierSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { towersSelector, useLevelStore } from "../../core/stores/useLevelStore";
import { UIHoldButton } from "../ui/buttons/UIHoldButton";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
} from "../ui/UICard";
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
      position={[tower.x, 1.6, tower.z]}
      onClick={onStopPropagation}
      onPointerDown={onStopPropagation}
    >
      <GUIWrapper position={[0, 0.48, 0]} distanceFactor={11}>
        <div
          className="pointer-events-auto w-56"
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

            <UICardContent className="gap-2">
              <UITypography variant="small" className="text-muted-foreground">
                {t(`towers.${tower.type}.description`)}
              </UITypography>

              <div className="grid grid-cols-3 gap-1.5">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-border/70 bg-muted/40 px-1.5 py-1.5"
                  >
                    <UITypography
                      variant="verySmall"
                      className="text-muted-foreground uppercase tracking-[0.12em]"
                    >
                      {stat.label}
                    </UITypography>
                    <UITypography
                      variant="small"
                      className="mt-1 font-semibold"
                    >
                      {stat.value}
                    </UITypography>
                  </div>
                ))}
              </div>
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
