import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopArcadeProps = {
  shop: TowerShopState;
};

/**
 * Arcade shop: a bottom-center "dock" of slot-machine tower slots in a
 * single row — chunky pixel frame, hard shadows, a per-tower color strip
 * on top and the price punched in the corner.
 */
export const TowerShopArcade: FC<TowerShopArcadeProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between px-1">
        <UITypography variant="small" className="hud-arcade-title uppercase">
          {t("towerShop.title")}
        </UITypography>
        {shop.hasSelection && (
          <UIButton
            data-testid="tower-cancel-selection"
            onClick={shop.onCancelSelection}
            variant="destructive"
            className="hud-pixel-panel px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-red-300 hover:bg-red-500/20"
          >
            ✕ {t("towerShop.cancelSelection")}
          </UIButton>
        )}
      </div>

      <div className="flex gap-3">
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
                "hud-arcade-slot relative flex h-auto w-28 flex-col items-center gap-1 overflow-hidden px-2 pb-2 pt-4",
                (shop.denyPulse[tower.id] ?? 0) > 0 &&
                  "animate-hud-denied-shake",
                isSelected && "hud-arcade-slot-active",
                !canAfford && "opacity-40"
              )}
            >
              <span
                className="absolute inset-x-0 top-0 h-2"
                style={{ backgroundColor: tower.color }}
              />
              <span className="hud-arcade-body text-[11px] leading-tight text-center">
                {t(`towers.${tower.id}.name`)}
              </span>
              <UITypography
                variant="verySmall"
                className="hud-arcade-body line-clamp-2 text-center leading-tight opacity-80"
              >
                {t(`towers.${tower.id}.description`)}
              </UITypography>
              <span
                className={cn(
                  "mt-auto font-mono text-xs font-bold",
                  canAfford ? "text-yellow-300" : "text-red-400"
                )}
              >
                ${cost}
              </span>
            </UIButton>
          );
        })}
      </div>
    </div>
  );
};
