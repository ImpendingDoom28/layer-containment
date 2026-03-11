import {
  FC,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useMemo,
} from "react";
import type { ThreeEvent } from "@react-three/fiber";

import type { Tower as TowerInstance } from "../../core/types/game";
import { useGameStore } from "../../core/stores/useGameStore";
import { UIButton } from "../ui/UIButton";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
  UICardTitle,
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
  const { towerSellPriceMultiplier } = useGameStore();
  const sellPrice = useMemo(() => {
    return Math.floor(tower.cost * towerSellPriceMultiplier);
  }, [tower.cost, towerSellPriceMultiplier]);

  const stats = useMemo(() => {
    return [
      { label: "Damage", value: tower.damage.toString() },
      { label: "Range", value: tower.range.toFixed(1) },
      { label: "Fire Rate", value: `${tower.fireRate.toFixed(1)}s` },
    ];
  }, [tower.damage, tower.fireRate, tower.range]);

  const onStopScenePropagation = (
    event: ThreeEvent<MouseEvent> | ThreeEvent<PointerEvent>
  ) => {
    event.stopPropagation();
  };

  const onStopPanelPropagation = (
    event:
      | ReactMouseEvent<HTMLDivElement | HTMLButtonElement>
      | ReactPointerEvent<HTMLDivElement | HTMLButtonElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
  };

  const yOffset = 1.6;
  const worldPosition: [number, number, number] = [tower.x, yOffset, tower.z];

  return (
    <group
      position={worldPosition}
      onClick={onStopScenePropagation}
      onPointerDown={onStopScenePropagation}
    >
      <GUIWrapper position={[0, 0.48, 0]} distanceFactor={11}>
        <div
          className="pointer-events-auto w-52"
          onPointerDown={onStopPanelPropagation}
        >
          <UICard
            size="sm"
            className="border border-border/80 bg-card/95 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-sm"
          >
            <UICardHeader className="border-b border-border/70">
              <UICardTitle className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <UITypography
                    variant="verySmall"
                    className="text-primary uppercase tracking-[0.22em]"
                  >
                    Selected Tower
                  </UITypography>
                  <UITypography variant="medium" className="mt-1 font-semibold">
                    {tower.name}
                  </UITypography>
                </div>
                <UITypography
                  variant="verySmall"
                  className="shrink-0 text-muted-foreground uppercase tracking-[0.18em]"
                >
                  #{tower.id}
                </UITypography>
              </UICardTitle>
            </UICardHeader>

            <UICardContent className="gap-2">
              <UITypography variant="small" className="text-muted-foreground">
                {tower.description}
              </UITypography>

              <div className="grid grid-cols-3 gap-1.5">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-border/70 bg-muted/40 px-2 py-1.5"
                  >
                    <UITypography
                      variant="verySmall"
                      className="text-muted-foreground uppercase tracking-[0.16em]"
                    >
                      {stat.label}
                    </UITypography>
                    <UITypography variant="small" className="mt-1 font-semibold">
                      {stat.value}
                    </UITypography>
                  </div>
                ))}
              </div>
            </UICardContent>

            <UICardFooter className="border-border/70 p-0">
              <UIButton
                onClick={(event) => {
                  onStopPanelPropagation(event);
                  onSell();
                }}
                onPointerDown={onStopPanelPropagation}
                variant="destructive"
                size="sm"
                className="h-8 w-full border-0"
              >
                Sell ${sellPrice}
              </UIButton>
            </UICardFooter>
          </UICard>
        </div>
      </GUIWrapper>
    </group>
  );
};
