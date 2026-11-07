import { FC, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { UIButton } from "@/components/ui/buttons/UIButton";
import { useIsMobile } from "../../core/hooks/useIsMobile";
import {
  selectedTowerTypeToPlaceSelector,
  setSelectedTowerTypeToPlaceSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { HUDWrapper } from "./HUDWrapper";
import {
  UICard,
  UICardAction,
  UICardContent,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import { UITypography } from "../ui/UITypography";
import { UIMoney } from "../ui/UIMoney";
import { cn } from "@/components/ui/lib/twUtils";
import { TOWER_SHOP_MONEY_ICON_SIZE_PX } from "../../constants/uiActionDeniedFeedback";
import { towerShopRowElementId } from "../../core/utils/towerShopRowElementId";
import { TowerModelPreview } from "./TowerModelPreview";

type HUDTowerShopProps = {
  money: number;
};

// The 3D preview box: a small rounded square the model is fitted into, shared
// by the desktop grid and the mobile bottom bar (smaller there).
const PREVIEW_BOX_CLASSES = "relative shrink-0 overflow-hidden rounded-lg bg-black/40";

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

  // The tower's 3D model in a small rounded box, with a bottom-to-top
  // black→transparent gradient over it so the price, pinned at the box's
  // bottom, stays readable against any model.
  const renderPreview = (tower: (typeof towerTypesValues)[number]) => (
    <div
      className={cn(
        PREVIEW_BOX_CLASSES,
        isMobile ? "h-14 w-14" : "h-20 w-20"
      )}
    >
      <TowerModelPreview model={tower.model} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black to-transparent" />
      <div className="absolute inset-x-0 bottom-1 flex justify-center">
        <UIMoney
          money={tower.cost}
          variant="small"
          iconSize={TOWER_SHOP_MONEY_ICON_SIZE_PX}
          className="text-white drop-shadow"
        />
      </div>
    </div>
  );

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

    return (
      <div
        className="relative flex"
        data-hud-animation-id={towerShopRowElementId(tower.id)}
        key={tower.id}
      >
        <UIButton
          data-testid={`tower-${tower.id}`}
          onClick={onTowerClick}
          disabled={isDisabled}
          aria-label={t(`towers.${tower.id}.name`)}
          deniedData={deniedData}
          variant={towerButtonVariant}
          className={cn(
            "flex shrink-0 items-center justify-center overflow-hidden",
            isMobile ? "h-16 w-16 p-1.5" : "h-24 w-24 p-2"
          )}
        >
          {renderPreview(tower)}
        </UIButton>
      </div>
    );
  };

  const selectedCancel = selectedTowerType && (
    <UIButton
      data-testid="tower-cancel-selection"
      onClick={onCancelSelection}
      variant="destructive"
      aria-label={t("towerShop.cancelSelection")}
      className={cn(isMobile ? "h-16 w-14 shrink-0" : "h-8")}
    >
      {isMobile ? (
        <Icon name="X" color="destructive" />
      ) : (
        t("towerShop.cancelSelection")
      )}
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
    <HUDWrapper className="bottom-2 left-2 top-auto">
      <div
        data-testid="tower-shop"
        className="ui-menu-tilt ui-menu-tilt-left ui-menu-tilt-shadow-left"
      >
        <UICard className="flex flex-col gap-2 p-3">
          <UICardHeader className="px-0">
            <UICardTitle>
              <UITypography variant="h4">{t("towerShop.title")}</UITypography>
            </UICardTitle>
            {selectedCancel && (
              <UICardAction>{selectedCancel}</UICardAction>
            )}
          </UICardHeader>
          <UICardContent className="gap-2 px-0">
            <div className="grid grid-cols-3 gap-2">
              {towerTypesValues.map((tower) => renderTowerButton(tower))}
            </div>
          </UICardContent>
        </UICard>
      </div>
    </HUDWrapper>
  );
};
