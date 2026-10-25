import { FC } from "react";
import { Menu } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useIsMobile } from "../../core/hooks/useIsMobile";
import type { GameStatus } from "../../core/types/game";
import { UIButton } from "../ui/buttons/UIButton";
import { HUDWrapper } from "./HUDWrapper";

type HUDMobileMenuButtonProps = {
  gameStatus: GameStatus;
  onOpenGameMenu: () => void;
};

/**
 * Top-right "menu" button, shown only on narrow screens while a run is
 * active. Desktop has no equivalent (ESC opens the game menu), so this is
 * the mobile entry point into the game menu; it stays above the pause
 * vignette (z-55) so it is always reachable.
 */
export const HUDMobileMenuButton: FC<HUDMobileMenuButtonProps> = ({
  gameStatus,
  onOpenGameMenu,
}) => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  // Desktop opens the game menu with the ESC key, so the button only exists
  // on narrow screens.
  if (!isMobile) {
    return null;
  }

  if (gameStatus !== "playing" && gameStatus !== "paused") {
    return null;
  }

  return (
    <HUDWrapper className="top-2 right-2 left-auto bottom-auto z-[60]">
      <UIButton
        data-testid="mobile-menu-button"
        onClick={onOpenGameMenu}
        variant="secondary"
        size="icon"
        aria-label={t("gameMenu.title")}
      >
        <Menu />
      </UIButton>
    </HUDWrapper>
  );
};
