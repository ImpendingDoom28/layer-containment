import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Coins } from "lucide-react";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import type { TowerShopState } from "../useHudPanels";

type TowerShopGlassProps = {
  shop: TowerShopState;
};

export const TowerShopGlass: FC<TowerShopGlassProps> = ({ shop }) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex flex-1 flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between">
        <UITypography
          variant="h4"
          className="font-light tracking-wide text-white"
        >
          {t("towerShop.title")}
        </UITypography>
        <UITypography
          variant="verySmall"
          className="text-white/50 tracking-widest"
        >
          {shop.entries.length.toString().padStart(2, "0")}/06
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
                  "h-full min-h-[68px] w-full flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-white/5 p-3 text-left backdrop-blur-md transition-all",
                  isSelected &&
                    "border-white/40 bg-white/15 shadow-[0_0_24px_-6px_var(--color-primary-hex)]",
                  !canAfford && "opacity-40"
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-3 rounded-full ring-2 ring-white/20"
                      style={{
                        backgroundColor: tower.color,
                        boxShadow: `0 0 10px ${tower.color}`,
                      }}
                    />
                    <span className="text-[12px] font-medium text-white">
                      {t(`towers.${tower.id}.name`)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 text-[11px] font-semibold",
                      canAfford ? "text-emerald-300" : "text-red-300"
                    )}
                  >
                    <Coins size={11} />
                    {cost}
                  </span>
                </div>
                <UITypography
                  variant="verySmall"
                  className="leading-snug text-white/50"
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
          className="rounded-2xl border border-white/10 bg-white/5 py-2 text-[11px] font-medium tracking-wider text-white/80 backdrop-blur-md hover:bg-white/10"
        >
          {t("towerShop.cancelSelection")}
        </UIButton>
      )}
    </div>
  );
};
