import { FC, useMemo } from "react";

import type { TowerType } from "../../core/types/game";
import { UIButton } from "@/components/ui/UIButton";
import { UITypography } from "../ui/UITypography";
import {
  denyPulseSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { HUDWrapper } from "./HUDWrapper";
import { UICard, UICardContent, UICardHeader, UICardTitle } from "../ui/UICard";
import { UIMoney } from "../ui/UIMoney";
import { cn } from "@/components/ui/lib/twUtils";
import { TOWER_SHOP_MONEY_ICON_SIZE_PX } from "../../constants/uiActionDeniedFeedback";

type HUDTowerShopProps = {
  selectedTowerType: TowerType | null;
  money: number;
  onSelectTower: (towerType: TowerType) => void;
  onDeselectTower: () => void;
};

export const HUDTowerShop: FC<HUDTowerShopProps> = ({
  selectedTowerType,
  money,
  onSelectTower,
  onDeselectTower,
}) => {
  const denyPulse = useGameStore(denyPulseSelector);
  const towerTypes = useGameStore(towerTypesSelector);
  const towerTypesValues = useMemo(() => {
    return Object.values(towerTypes ?? {}).sort((a, b) => a.cost - b.cost);
  }, [towerTypes]);

  return (
    <HUDWrapper className="bottom-auto w-80 top-4 left-4">
      <UICard>
        <UICardHeader>
          <UICardTitle>
            <UITypography variant="h4">Tower Shop</UITypography>
          </UICardTitle>
        </UICardHeader>
        <UICardContent className="gap-2">
          {towerTypesValues.map((tower) => {
            const canAfford = money >= tower.cost;
            const isSelected = selectedTowerType === tower.id;
            const isDisabled = !canAfford;
            const deniedData = canAfford
              ? undefined
              : ({
                  reason: "insufficient_funds",
                  towerType: tower.id,
                } as const);

            let towerButtonVariant: "default" | "outline" | "ghost" = "ghost";
            if (isSelected) {
              towerButtonVariant = "default";
            } else if (canAfford) {
              towerButtonVariant = "outline";
            }

            const onTowerClick = () => {
              if (isSelected) {
                onDeselectTower();
              } else if (canAfford) {
                onSelectTower(tower.id);
              }
            };

            return (
              <div
                className={cn(
                  "relative flex flex-1",
                  (denyPulse[tower.id] ?? 0) > 0 && "animate-hud-denied-shake"
                )}
                key={`${tower.id}-${denyPulse[tower.id] ?? 0}`}
              >
                <div
                  className={`${canAfford ? "text-green-400" : "text-red-400"} absolute top-2 right-2`}
                >
                  <UIMoney
                    money={tower.cost}
                    variant={"medium"}
                    iconSize={TOWER_SHOP_MONEY_ICON_SIZE_PX}
                  />
                </div>
                <UIButton
                  onClick={onTowerClick}
                  disabled={isDisabled}
                  className={cn(
                    "h-24 w-full flex flex-col text-start items-start"
                  )}
                  deniedData={deniedData}
                  variant={towerButtonVariant}
                >
                  <UITypography variant="medium">{tower.name}</UITypography>
                  <UITypography className="text-gray-300" variant={"small"}>
                    {tower.description}
                  </UITypography>
                </UIButton>
              </div>
            );
          })}
          {selectedTowerType && (
            <UIButton onClick={onDeselectTower} variant="destructive">
              Cancel Selection
            </UIButton>
          )}
        </UICardContent>
      </UICard>
    </HUDWrapper>
  );
};
