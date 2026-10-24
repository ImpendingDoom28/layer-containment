import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Circle } from "lucide-react";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopTacticalProps = {
  shop: TowerShopState;
};

export const TowerShopTactical: FC<TowerShopTacticalProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-1 flex-col gap-3 bg-[#141a14] p-4">
      <div className="flex items-center justify-between border-b border-lime-500/30 pb-2">
        <div className="flex items-center gap-2">
          <Circle
            size={8}
            className="fill-lime-400 text-lime-400 hud-led-pulse"
          />
          <UITypography variant="h4" className="hud-stencil text-lime-300">
            {t("towerShop.title")}
          </UITypography>
        </div>
        <UITypography
          variant="verySmall"
          className="hud-stencil text-lime-600/70"
        >
          OP·{shop.entries.length.toString().padStart(2, "0")}
        </UITypography>
      </div>

      <div className="flex flex-1 flex-col gap-2">
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
                  "h-full min-h-[72px] w-full flex flex-col items-start gap-1.5 rounded-none border-2 border-lime-500/25 bg-[#0d120d] p-3 text-left",
                  isSelected && "hud-tactical-selected border-lime-400",
                  !canAfford && "opacity-50"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 rotate-45"
                      style={{ backgroundColor: tower.color }}
                    />
                    <span className="hud-stencil text-[12px] font-bold text-lime-200">
                      {t(`towers.${tower.id}.name`)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "hud-stencil text-[12px] font-bold",
                      canAfford ? "text-amber-300" : "text-red-400"
                    )}
                  >
                    ${cost}
                  </span>
                </div>
                <UITypography
                  variant="verySmall"
                  className="leading-snug text-lime-100/50"
                >
                  {t(`towers.${tower.id}.description`)}
                </UITypography>
                {isSelected && (
                  <span className="hud-stencil text-[9px] tracking-[0.3em] text-lime-400">
                    ▸ {t("hudTheme.deployed")}
                  </span>
                )}
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
          className="rounded-none border-2 border-red-500/50 bg-red-500/10 py-2 text-[11px] font-bold tracking-[0.3em] text-red-300 hover:bg-red-500/20"
        >
          ✕ {t("towerShop.cancelSelection")}
        </UIButton>
      )}
    </div>
  );
};
