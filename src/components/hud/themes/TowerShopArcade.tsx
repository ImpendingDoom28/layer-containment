import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopArcadeProps = {
  shop: TowerShopState;
};

export const TowerShopArcade: FC<TowerShopArcadeProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="hud-arcade-checker relative flex flex-1 flex-col gap-3 p-4">
      <div className="hud-pixel-panel px-3 py-2">
        <UITypography
          variant="h4"
          className="hud-arcade-title animate-pulse text-center"
        >
          {t("towerShop.title")}
        </UITypography>
      </div>

      <div className="flex flex-1 flex-col gap-2.5">
        {shop.entries.map(({ tower, cost, canAfford, isSelected }) => {
          const deniedData = canAfford
            ? undefined
            : ({
                reason: "insufficient_funds",
                towerType: tower.id,
              } as const);

          return (
            <div
              className={cn(
                "relative flex flex-1",
                (shop.denyPulse[tower.id] ?? 0) > 0 &&
                  "animate-hud-denied-shake"
              )}
              key={`${tower.id}-${shop.denyPulse[tower.id] ?? 0}`}
            >
              <UIButton
                data-testid={`tower-${tower.id}`}
                onClick={() => shop.onSelect(tower.id)}
                disabled={!canAfford}
                variant={canAfford ? "outline" : "ghost"}
                deniedData={deniedData}
                className={cn(
                  "hud-pixel-panel h-full min-h-[68px] w-full flex flex-col items-start gap-1 p-3 text-left",
                  isSelected && "hud-arcade-selected",
                  !canAfford && "opacity-45"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span
                    className="hud-arcade-body text-[12px] font-bold"
                    style={{ color: tower.color }}
                  >
                    {t(`towers.${tower.id}.name`)}
                  </span>
                  <span
                    className={cn(
                      "hud-arcade-body text-[12px] font-bold",
                      canAfford ? "text-yellow-300" : "text-red-400"
                    )}
                  >
                    ${cost}
                  </span>
                </div>
                <UITypography
                  variant="verySmall"
                  className="hud-arcade-body leading-snug opacity-70"
                >
                  {t(`towers.${tower.id}.description`)}
                </UITypography>
                <span className="h-1.5 w-full bg-black/50">
                  <span
                    className={cn(
                      "block h-full transition-all",
                      isSelected ? "w-full" : "w-0"
                    )}
                    style={{ backgroundColor: tower.color }}
                  />
                </span>
              </UIButton>
            </div>
          );
        })}
      </div>

      {shop.hasSelection && (
        <UIButton
          data-testid="tower-cancel-selection"
          onClick={shop.onCancelSelection}
          variant="destructive"
          className="hud-pixel-panel py-2 text-[11px] font-bold tracking-widest text-red-400 hover:text-red-300"
        >
          ✕ {t("towerShop.cancelSelection")}
        </UIButton>
      )}
    </div>
  );
};
