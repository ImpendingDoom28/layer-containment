import { FC } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../ui/lib/twUtils";
import { HUDWrapper } from "./HUDWrapper";
import { useHudShopState } from "./useHudPanels";
import {
  hudThemeSelector,
  useHudThemeStore,
  type HudThemeId,
} from "../../core/stores/useHudThemeStore";
import { TowerShopCommand } from "./themes/TowerShopCommand";
import { TowerShopHologram } from "./themes/TowerShopHologram";
import { TowerShopTactical } from "./themes/TowerShopTactical";
import { TowerShopArcade } from "./themes/TowerShopArcade";
import { TowerShopGlass } from "./themes/TowerShopGlass";

type HUDTowerShopProps = {
  money: number;
};

const TOWER_SHOP_THEMES: Record<
  HudThemeId,
  FC<{ shop: ReturnType<typeof useHudShopState> }>
> = {
  command: TowerShopCommand,
  hologram: TowerShopHologram,
  tactical: TowerShopTactical,
  arcade: TowerShopArcade,
  glass: TowerShopGlass,
};

/**
 * Where the shop lives on screen, per theme. Each theme uses a different
 * panel placement + layout on purpose (left rail, right ops column,
 * bottom dock, floating grid) instead of one shared top-left card.
 * The wrapper box is exactly the panel so the game-camera block only
 * covers the panel, not the whole screen.
 */
const SHOP_WRAPPER: Record<HudThemeId, string> = {
  // Command matches the original master box exactly (e2e depends on it).
  command: "bottom-auto right-auto w-80 top-4 left-4",
  // Full-height left armory rail.
  hologram: "top-0 bottom-0 left-0 right-auto w-72",
  // Full-height right ops column.
  tactical: "top-0 bottom-0 left-auto right-0 w-80",
  // Bottom-center dock; the wrapper spans the bottom edge and centers it.
  arcade: "top-auto bottom-3 left-0 right-0 flex justify-center",
  // Floating tile grid, top-left.
  glass: "bottom-auto right-auto top-5 left-5 w-[24rem]",
};

/** The panel chrome (frame/background) that wraps each theme's content. */
const SHOP_CHROME: Record<HudThemeId, string> = {
  command:
    "ui-menu-tilt ui-menu-tilt-left ui-menu-tilt-shadow-left flex h-full w-full flex-col",
  hologram:
    "hud-holo-rail hud-scanlines overflow-hidden flex h-full w-full flex-col",
  tactical: "hud-tactical-board flex h-full w-full flex-col",
  arcade: "hud-arcade-dock flex w-fit flex-col",
  glass: "flex w-full flex-col",
};

/**
 * The region box is a stretchy (flex-1) list in the full-height rail/column
 * themes but a natural-height block in the dock/grid themes so the content
 * never gets squashed by a zero flex basis.
 */
const SHOP_REGION: Record<HudThemeId, string> = {
  command: "flex h-full w-full flex-col",
  hologram: "flex w-full min-h-0 flex-1 flex-col",
  tactical: "flex w-full min-h-0 flex-1 flex-col",
  arcade: "flex flex-col",
  glass: "flex w-full flex-col",
};

export const HUDTowerShop: FC<HUDTowerShopProps> = ({ money }) => {
  const { t } = useTranslation();
  const theme = useHudThemeStore(hudThemeSelector);
  const shop = useHudShopState(money);
  const ShopTheme = TOWER_SHOP_THEMES[theme];

  return (
    <HUDWrapper className={SHOP_WRAPPER[theme]}>
      <div className={cn(SHOP_CHROME[theme])}>
        <div
          data-testid="tower-shop"
          role="region"
          aria-label={t("towerShop.title")}
          className={SHOP_REGION[theme]}
        >
          <ShopTheme shop={shop} />
        </div>
      </div>
    </HUDWrapper>
  );
};
