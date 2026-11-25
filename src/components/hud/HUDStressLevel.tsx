import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { HUDWrapper } from "./HUDWrapper";
import { UIButton } from "../ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";

type HUDStressLevelProps = {
  onBackToMenu: () => void;
};

/**
 * Minimal HUD for the stress-test scene: a back button and a title/description
 * card. The rest of the screen is left to the 3D canvas (the pinned
 * end-of-map view) and the live metrics overlay.
 */
export const HUDStressLevel: FC<HUDStressLevelProps> = ({ onBackToMenu }) => {
  const { t } = useTranslation();

  return (
    <HUDWrapper className="pointer-events-none">
      <div className="flex h-full flex-col items-end p-4 md:p-6">
        <div className="pointer-events-auto flex flex-col gap-3">
          <UIButton
            variant="ghost"
            size="icon-sm"
            data-testid="stress-level-back"
            onClick={onBackToMenu}
            title={t("stressLevel.backToMenu")}
            aria-label={t("stressLevel.backToMenu")}
            className="bg-card shadow-2xl"
          >
            <Icon name="ChevronLeft" />
          </UIButton>

          <div className="max-w-xs bg-card/90 p-4 shadow-2xl">
            <UITypography variant="h3" className="text-foreground">
              {t("stressLevel.title")}
            </UITypography>
            <UITypography
              variant="body"
              className="mt-2 text-muted-foreground"
            >
              {t("stressLevel.description")}
            </UITypography>
          </div>
        </div>
      </div>
    </HUDWrapper>
  );
};
