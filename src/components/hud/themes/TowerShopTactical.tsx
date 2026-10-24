import { FC } from "react";
import { Circle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopTacticalProps = {
  shop: TowerShopState;
};

/**
 * Tactical shop: a right-edge ops column of tower cards in a 2×3 grid.
 * Each card carries a status LED (tower color), stencil type, a $ cost
 * and a diamond swatch; arming one lights its LED and stamps it DEPLOYED.
 */
export const TowerShopTactical: FC<TowerShopTacticalProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Circle
            size={8}
            className="hud-led-pulse fill-lime-400 text-lime-400"
          />
          <UITypography variant="small" className="hud-stencil text-lime-200">
            {t("towerShop.title")}
          </UITypography>
        </div>
        <UITypography
          variant="verySmall"
          className="hud-stencil text-lime-500/70"
        >
          OP·{shop.entries.length.toString().padStart(2, "0")}
        </UITypography>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-2 gap-2 overflow-y-auto">
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
                "hud-tactical-card h-auto flex flex-col gap-1.5 p-2.5 text-left",
                (shop.denyPulse[tower.id] ?? 0) > 0 &&
                  "animate-hud-denied-shake",
                isSelected && "hud-tactical-selected",
                !canAfford && "opacity-45"
              )}
            >
              <div className="flex items-center justify-between">
                <Circle
                  size={8}
                  className={cn(isSelected && "hud-led-pulse")}
                  style={{
                    color: tower.color,
                    fill: isSelected ? tower.color : "transparent",
                  }}
                />
                <span
                  className="size-2 rotate-45"
                  style={{ backgroundColor: tower.color }}
                />
              </div>
              <span className="hud-stencil text-[11px] leading-tight text-lime-100">
                {t(`towers.${tower.id}.name`)}
              </span>
              <UITypography
                variant="verySmall"
                className="text-lime-300/70 leading-snug"
              >
                {t(`towers.${tower.id}.description`)}
              </UITypography>
              <div className="mt-auto flex items-center justify-between">
                <span
                  className={cn(
                    "hud-stencil text-xs",
                    canAfford ? "text-amber-300" : "text-red-400"
                  )}
                >
                  ${cost}
                </span>
                {isSelected && (
                  <span className="hud-stencil text-[10px] text-lime-300">
                    ▸ {t("hudTheme.deployed")}
                  </span>
                )}
              </div>
            </UIButton>
          );
        })}
      </div>

      {shop.hasSelection && (
        <UIButton
          data-testid="tower-cancel-selection"
          onClick={shop.onCancelSelection}
          variant="destructive"
          className="mt-3 w-full py-2"
        >
          {t("towerShop.cancelSelection")}
        </UIButton>
      )}
    </div>
  );
};
