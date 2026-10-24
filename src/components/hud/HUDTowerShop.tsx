import { FC } from "react";
import { useTranslation } from "react-i18next";

import { HUDWrapper } from "./HUDWrapper";
import { HudThemePanel, HudThemeShell } from "./hudThemePanel";
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

export const HUDTowerShop: FC<HUDTowerShopProps> = ({ money }) => {
  const { t } = useTranslation();
  const theme = useHudThemeStore(hudThemeSelector);
  const shop = useHudShopState(money);
  const ShopTheme = TOWER_SHOP_THEMES[theme];

  return (
    <HUDWrapper className="bottom-auto w-80 top-4 left-4">
      <HudThemeShell theme={theme} side="left" className="h-full">
        <HudThemePanel theme={theme} className="flex-1 shadow-panel">
          <div
            data-testid="tower-shop"
            role="region"
            aria-label={t("towerShop.title")}
            className="flex flex-1 flex-col"
          >
            <ShopTheme shop={shop} />
          </div>
        </HudThemePanel>
      </HudThemeShell>
    </HUDWrapper>
  );
};
