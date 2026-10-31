import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { HUDWrapper } from "./HUDWrapper";
import { UIButton } from "../ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";

type HUDTestingLevelProps = {
  onBackToGame: () => void;
};

/**
 * Minimal HUD for the 3D asset showcase: a back button and a title/description
 * card. The rest of the screen is left to the 3D canvas (orbit + zoom).
 */
export const HUDTestingLevel: FC<HUDTestingLevelProps> = ({ onBackToGame }) => {
  const { t } = useTranslation();

  return (
    <HUDWrapper className="pointer-events-none">
      <div className="flex h-full flex-col items-start p-4 md:p-6">
        <div className="pointer-events-auto flex flex-col gap-3">
          <UIButton
            variant="ghost"
            size="icon-sm"
            data-testid="testing-level-back"
            onClick={onBackToGame}
            title={t("testingLevel.backToMenu")}
            aria-label={t("testingLevel.backToMenu")}
            className="bg-card shadow-2xl"
          >
            <Icon name="ChevronLeft" />
          </UIButton>

          <div className="max-w-xs bg-card/90 p-4 shadow-2xl">
            <UITypography variant="h3" className="text-foreground">
              {t("testingLevel.title")}
            </UITypography>
            <UITypography
              variant="body"
              className="mt-2 text-muted-foreground"
            >
              {t("testingLevel.description")}
            </UITypography>
          </div>
        </div>
      </div>
    </HUDWrapper>
  );
};
