import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { UITypography } from "../ui/UITypography";
import { UICard, UICardContent } from "../ui/UICard";
import { useBossInfo } from "../../core/hooks/useBossInfo";
import { useIsMobile } from "../../core/hooks/useIsMobile";
import { HUDWrapper } from "./HUDWrapper";

/**
 * Big HUD boss bar, shown while a level boss is on the field: the boss's name
 * (from the level's boss config) and a wide health bar that drains as the
 * boss takes damage. Hides itself the moment the boss dies — the `IsBoss`
 * tag goes with it — and does not block camera input (no
 * `data-game-camera-block`).
 */
export const HUDBossBar: FC = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const boss = useBossInfo();

  if (!boss || boss.maxHealth <= 0) return null;

  const percent = Math.max(0, Math.min(1, boss.health / boss.maxHealth));

  const bar = (
    <UICard
      data-testid="boss-bar"
      className="w-full max-w-md border-2 border-red-500/60 bg-card/90 shadow-panel backdrop-blur-sm"
    >
      <UICardContent className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Icon name="Skull" color="red3" size={16} className="shrink-0" />
            <UITypography
              variant="medium"
              className="truncate font-semibold uppercase tracking-[0.14em]"
            >
              {boss.name}
            </UITypography>
          </div>
          <UITypography variant="medium" className="shrink-0 tabular-nums">
            {Math.max(0, Math.ceil(boss.health))} / {boss.maxHealth}
          </UITypography>
        </div>
        <div
          className="h-3 w-full overflow-hidden rounded-sm bg-black/50"
          role="progressbar"
          aria-label={t("bossBar.health")}
          aria-valuemin={0}
          aria-valuemax={boss.maxHealth}
          aria-valuenow={Math.max(0, Math.ceil(boss.health))}
        >
          <div
            className="h-full rounded-sm bg-red-500 transition-[width] duration-150 ease-out"
            style={{ width: `${percent * 100}%` }}
          />
        </div>
      </UICardContent>
    </UICard>
  );

  return (
    <HUDWrapper
      className={
        isMobile
          ? "pointer-events-none flex items-start justify-center pt-16"
          : "pointer-events-none flex items-start justify-center pt-4"
      }
    >
      {bar}
    </HUDWrapper>
  );
};
