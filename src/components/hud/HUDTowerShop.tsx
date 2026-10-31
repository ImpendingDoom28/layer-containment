import { FC, useMemo } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";
import { useIsMobile } from "../../core/hooks/useIsMobile";
import {
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
import { towerShopRowElementId } from "../../core/utils/towerShopRowElementId";

type HUDTowerShopProps = {
  money: number;
};

export const HUDTowerShop: FC<HUDTowerShopProps> = ({ money }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const setSelectedTowerType = useGameStore(
    setSelectedTowerTypeToPlaceSelector
  );
  const selectedTowerType = useGameStore(selectedTowerTypeToPlaceSelector);
  const towerTypes = useGameStore(towerTypesSelector);
  const towerTypesValues = useMemo(() => {
    return Object.values(towerTypes ?? {}).sort((a, b) => a.cost - b.cost);
  }, [towerTypes]);

  const onCancelSelection = () => {
    setSelectedTowerType(null);
  };

  const renderTowerButton = (tower: (typeof towerTypesValues)[number]) => {
    const canAfford = money >= tower.cost;
    const isSelected = selectedTowerType === tower.id;
    const isDisabled = !canAfford;
    const deniedData = canAfford
      ? undefined
      : ({
          reason: "insufficient_funds",
          towerType: tower.id,
          elementId: towerShopRowElementId(tower.id),
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

    const costLabel = (
      <div
        className={`${canAfford ? "text-green-400" : "text-red-400"} shrink-0`}
      >
        <UIMoney
          money={tower.cost}
          variant="medium"
          iconSize={TOWER_SHOP_MONEY_ICON_SIZE_PX}
        />
      </div>
    );

    return (
      <div
        className="relative flex"
        data-hud-animation-id={towerShopRowElementId(tower.id)}
        key={tower.id}
      >
        {isMobile ? (
          <UIButton
            data-testid={`tower-${tower.id}`}
            onClick={onTowerClick}
            disabled={isDisabled}
            className="h-20 w-24 shrink-0 flex-col gap-1 px-2 py-2 items-start text-start"
            deniedData={deniedData}
            variant={towerButtonVariant}
          >
            <UITypography variant="small" className="leading-tight">
              {t(`towers.${tower.id}.name`)}
            </UITypography>
            {costLabel}
          </UIButton>
        ) : (
          <>
            <div className="absolute top-2 right-2">{costLabel}</div>
            <UIButton
              data-testid={`tower-${tower.id}`}
              onClick={onTowerClick}
              disabled={isDisabled}
              className={cn("h-24 w-full flex flex-col text-start items-start")}
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
          </>
        )}
      </div>
    );
  };

  const selectedCancel = selectedTowerType && (
    <UIButton
      data-testid="tower-cancel-selection"
      onClick={onCancelSelection}
      variant="destructive"
      aria-label={t("towerShop.cancelSelection")}
      className={cn(isMobile ? "h-10 w-14 shrink-0" : undefined)}
    >
      {isMobile ? <X /> : t("towerShop.cancelSelection")}
    </UIButton>
  );

  if (isMobile) {
    return (
      <HUDWrapper className="inset-x-0 bottom-0 top-auto p-2">
        <div
          data-testid="tower-shop"
          className="ui-menu-tilt ui-menu-tilt-right flex min-w-0 flex-1 items-end justify-between gap-2"
        >
          <div className="scroll-hide flex min-w-0 flex-1 items-end gap-2 overflow-x-auto pb-1">
            {towerTypesValues.map((tower) => renderTowerButton(tower))}
          </div>
          {selectedCancel}
        </div>
      </HUDWrapper>
    );
  }

  return (
    <HUDWrapper className="bottom-auto w-80 top-4 left-4">
      <div
        data-testid="tower-shop"
        className="ui-menu-tilt ui-menu-tilt-left ui-menu-tilt-shadow-left flex h-full flex-col"
      >
        <UICard className="flex-1">
          <UICardHeader>
            <UICardTitle>
              <UITypography variant="h4">{t("towerShop.title")}</UITypography>
            </UICardTitle>
          </UICardHeader>
          <UICardContent className="gap-2">
            {towerTypesValues.map((tower) => renderTowerButton(tower))}
            {selectedCancel}
          </UICardContent>
        </UICard>
      </div>
    </HUDWrapper>
  );
};
