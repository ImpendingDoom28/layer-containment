import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import {
  UICard,
  UICardContent,
  UICardHeader,
  UICardTitle,
} from "../../ui/UICard";
import { UITypography } from "../../ui/UITypography";
import { UIMoney } from "../../ui/UIMoney";
import { cn } from "@/components/ui/lib/twUtils";
import { TOWER_SHOP_MONEY_ICON_SIZE_PX } from "../../../constants/uiActionDeniedFeedback";
import type { TowerShopState } from "../useHudPanels";

type TowerShopCommandProps = {
  shop: TowerShopState;
};

export const TowerShopCommand: FC<TowerShopCommandProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <UICard className="flex-1">
      <UICardHeader>
        <UICardTitle>
          <UITypography variant="h4">{t("towerShop.title")}</UITypography>
        </UICardTitle>
      </UICardHeader>
      <UICardContent className="gap-2">
        {shop.entries.map(({ tower, cost, canAfford, isSelected }) => {
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

          return (
            <div
              className={cn(
                "relative flex flex-1",
                (shop.denyPulse[tower.id] ?? 0) > 0 &&
                  "animate-hud-denied-shake"
              )}
              key={`${tower.id}-${shop.denyPulse[tower.id] ?? 0}`}
            >
              <div
                className={`${canAfford ? "text-green-400" : "text-red-400"} absolute top-2 right-2`}
              >
                <UIMoney
                  money={cost}
                  variant={"medium"}
                  iconSize={TOWER_SHOP_MONEY_ICON_SIZE_PX}
                />
              </div>
              <UIButton
                data-testid={`tower-${tower.id}`}
                onClick={() => shop.onSelect(tower.id)}
                disabled={!canAfford}
                className={cn(
                  "h-24 w-full flex flex-col text-start items-start"
                )}
                deniedData={deniedData}
                variant={towerButtonVariant}
              >
                <UITypography variant="medium">
                  {t(`towers.${tower.id}.name`)}
                </UITypography>
                <UITypography className="text-gray-300" variant={"small"}>
                  {t(`towers.${tower.id}.description`)}
                </UITypography>
              </UIButton>
            </div>
          );
        })}
        {shop.hasSelection && (
          <UIButton
            data-testid="tower-cancel-selection"
            onClick={shop.onCancelSelection}
            variant="destructive"
          >
            {t("towerShop.cancelSelection")}
          </UIButton>
        )}
      </UICardContent>
    </UICard>
  );
};
