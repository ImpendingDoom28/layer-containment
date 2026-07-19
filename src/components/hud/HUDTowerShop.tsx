import { FC, useMemo } from "react";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";
import {
  denyPulseSelector,
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerTypeToPlaceSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { HUDWrapper } from "./HUDWrapper";
import { UICard, UICardContent, UICardHeader, UICardTitle } from "../ui/UICard";
import { UIMoney } from "../ui/UIMoney";
import { cn } from "@/components/ui/lib/twUtils";
import { TOWER_SHOP_MONEY_ICON_SIZE_PX } from "../../constants/uiActionDeniedFeedback";

type HUDTowerShopProps = {
  money: number;
};

export const HUDTowerShop: FC<HUDTowerShopProps> = ({ money }) => {
  const setSelectedTowerType = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );
  const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
  const denyPulse = useGameStore(denyPulseSelector);
  const towerTypes = useGameStore(towerTypesSelector);
  const towerTypesValues = useMemo(() => {
    return Object.values(towerTypes ?? {}).sort((a, b) => a.cost - b.cost);
  }, [towerTypes]);

  const onCancelSelection = () => {
    setSelectedTowerType(null);
  };

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
                onCancelSelection();
              } else if (canAfford) {
                setSelectedTowerType(tower.id);
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
            <UIButton onClick={onCancelSelection} variant="destructive">
              Cancel Selection
            </UIButton>
          )}
        </UICardContent>
      </UICard>
    </HUDWrapper>
  );
};
