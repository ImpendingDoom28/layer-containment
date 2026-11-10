import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { UITypography } from "../ui/UITypography";
import { UIButton } from "../ui/buttons/UIButton";
import { UICard, UICardContent, UICardHeader, UICardTitle } from "../ui/UICard";
import { HUDWrapper } from "./HUDWrapper";

type HUDLevelLoadErrorProps = {
  /**
   * Human-readable reason for the failed load, or undefined to show the
   * generic message.
   */
  message?: string;
  onRetry: () => void;
};

/**
 * Full-screen fallback shown when the level config fails to load: the loading
 * screen would otherwise stay up forever, since shader compilation (and the
 * `isGameReady` gate) never starts without a loaded level.
 */
export const HUDLevelLoadError: FC<HUDLevelLoadErrorProps> = ({
  message,
  onRetry,
}) => {
  const { t } = useTranslation();

  return (
    <HUDWrapper className="bg-black/80" data-testid="hud-level-load-error">
      <div className="m-auto flex w-[min(92vw,24rem)] flex-col">
        <UICard className="bg-card/90">
          <UICardHeader>
            <UICardTitle>
              <Icon name="AlertTriangle" color="destructive" size={20} />
              <UITypography variant="medium" className="text-foreground">
                {t("common.levelLoadFailed")}
              </UITypography>
            </UICardTitle>
          </UICardHeader>
          <UICardContent>
            <UITypography
              variant="small"
              className="whitespace-pre-wrap break-words text-muted-foreground"
            >
              {message || t("common.levelLoadFailedHint")}
            </UITypography>
          </UICardContent>
        </UICard>
        <UIButton
          data-testid="level-load-error-retry"
          onClick={onRetry}
          className="mt-4 w-full"
        >
          {t("common.retry")}
        </UIButton>
      </div>
    </HUDWrapper>
  );
};
