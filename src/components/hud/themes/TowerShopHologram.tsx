import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopHologramProps = {
  shop: TowerShopState;
};

export const TowerShopHologram: FC<TowerShopHologramProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="hud-holo-scan relative flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="hud-holo-dot size-2 bg-cyan-300" />
          <UITypography
            variant="h4"
            className="hud-holo-text tracking-[0.35em] uppercase"
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
                  "h-full min-h-[72px] w-full flex flex-col items-start gap-1.5 rounded-none border border-cyan-300/30 bg-cyan-300/5 p-3 text-left",
                  isSelected &&
                    "hud-holo-selected border-cyan-200 bg-cyan-300/15",
                  !canAfford && "opacity-60"
                )}
              >
                <span
                  className="absolute left-0 top-0 h-full w-[3px] bg-cyan-300/70"
                  style={{
                    backgroundColor: canAfford ? tower.color : undefined,
                  }}
                />
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="hud-holo-text-hud text-[11px] font-bold uppercase tracking-[0.25em]">
                    {t(`towers.${tower.id}.name`)}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[11px] font-bold tracking-widest",
                      canAfford ? "hud-holo-text" : "text-red-400"
                    )}
                  >
                    <Coins size={11} />
                    {cost}
                  </span>
                </div>
                <UITypography
                  variant="verySmall"
                  className="hud-holo-text-dim leading-snug"
                >
                  {t(`towers.${tower.id}.description`)}
                </UITypography>
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
          className="rounded-none border border-red-400/40 bg-red-500/10 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-red-300 hover:bg-red-500/20"
        >
          ✕ {t("towerShop.cancelSelection")}
        </UIButton>
      )}
    </div>
  );
};
