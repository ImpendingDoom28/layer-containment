import { FC } from "react";
import { Coins } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopHologramProps = {
  shop: TowerShopState;
};

/**
 * Hologram shop: a full-height left "armory rail" of cut-corner tiles.
 * Each tower is a slim tile with a per-tower accent stripe and lock-on
 * corner brackets when armed.
 */
export const TowerShopHologram: FC<TowerShopHologramProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="hud-holo-dot size-2 bg-cyan-300" />
          <UITypography
            variant="small"
            className="hud-holo-text tracking-[0.3em] uppercase"
          >
            {t("towerShop.title")}
          </UITypography>
        </div>
        <UITypography
          variant="verySmall"
          className="hud-holo-text-dim tracking-[0.2em]"
        >
          SYS·{shop.entries.length.toString().padStart(2, "0")}
        </UITypography>
      </div>

      <div className="hud-holo-hairline mx-4" />

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
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
                (shop.denyPulse[tower.id] ?? 0) > 0 &&
                  "animate-hud-denied-shake"
              )}
              key={`${tower.id}-${shop.denyPulse[tower.id] ?? 0}`}
            >
              <UIButton
                data-testid={`tower-${tower.id}`}
                onClick={() => shop.onSelect(tower.id)}
                disabled={!canAfford}
                variant="ghost"
                deniedData={deniedData}
                className={cn(
                  "hud-holo-tile h-auto w-full px-3 py-2 text-left",
                  isSelected && "hud-holo-tile-active hud-holo-corner",
                  !canAfford && "opacity-45"
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-9 w-1 shrink-0"
                    style={{ backgroundColor: tower.color }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="hud-holo-text truncate text-[11px] font-bold uppercase tracking-[0.2em]">
                        {t(`towers.${tower.id}.name`)}
                      </span>
                      <span
                        className={cn(
                          "flex shrink-0 items-center gap-1 text-[11px] font-bold tracking-widest",
                          canAfford ? "hud-holo-text" : "text-red-400"
                        )}
                      >
                        <Coins size={11} />
                        {cost}
                      </span>
                    </div>
                    <UITypography
                      variant="verySmall"
                      className="hud-holo-text-dim mt-0.5 line-clamp-2 leading-snug"
                    >
                      {t(`towers.${tower.id}.description`)}
                    </UITypography>
                  </div>
                </div>
              </UIButton>
            </div>
          );
        })}
      </div>

      {shop.hasSelection && (
        <div className="p-3 pt-1">
          <UIButton
            data-testid="tower-cancel-selection"
            onClick={shop.onCancelSelection}
            variant="destructive"
            className="hud-holo-tile w-full py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-red-300 hover:bg-red-500/10"
          >
            ✕ {t("towerShop.cancelSelection")}
          </UIButton>
        </div>
      )}
    </div>
  );
};
