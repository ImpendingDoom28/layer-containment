import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopGlassProps = {
  shop: TowerShopState;
};

/**
 * Glass shop: six frosted tiles floating over the field in a 3×2 grid —
 * each tower is its own glass sheet with a glowing orb swatch, big cost
 * and aurora sheen. Arming a tile gives it a bright rim glow.
 */
export const TowerShopGlass: FC<TowerShopGlassProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {shop.entries.map(({ tower, cost, canAfford, isSelected }) => {
          const deniedData = canAfford
            ? undefined
            : ({
                reason: "insufficient_funds",
                towerType: tower.id,
              } as const);

          return (
            <UIButton
              data-testid={`tower-${tower.id}`}
              onClick={() => shop.onSelect(tower.id)}
              disabled={!canAfford}
              variant="ghost"
              deniedData={deniedData}
              key={tower.id}
              className={cn(
                "hud-glass-tile flex h-auto min-h-[104px] flex-col p-3 text-left",
                (shop.denyPulse[tower.id] ?? 0) > 0 &&
                  "animate-hud-denied-shake",
                isSelected && "hud-glass-tile-active",
                !canAfford && "opacity-40"
              )}
            >
              <div className="mb-2 flex items-center justify-between">
                <span
                  className="size-5 rounded-full"
                  style={{
                    backgroundColor: tower.color,
                    boxShadow: `0 0 14px ${tower.color}88`,
                  }}
                />
                <span
                  className={cn(
                    "text-lg font-semibold leading-none",
                    canAfford ? "text-white" : "text-red-300"
                  )}
                >
                  ${cost}
                </span>
              </div>
              <span className="text-xs font-semibold leading-tight text-white/90">
                {t(`towers.${tower.id}.name`)}
              </span>
              <UITypography
                variant="verySmall"
                className="mt-1 line-clamp-2 leading-snug text-white/50"
              >
                {t(`towers.${tower.id}.description`)}
              </UITypography>
            </UIButton>
          );
        })}
      </div>

      {shop.hasSelection && (
        <UIButton
          data-testid="tower-cancel-selection"
          onClick={shop.onCancelSelection}
          variant="destructive"
          className="hud-glass-tile w-full rounded-full py-2 text-xs font-semibold text-red-200"
        >
          ✕ {t("towerShop.cancelSelection")}
        </UIButton>
      )}
    </div>
  );
};
