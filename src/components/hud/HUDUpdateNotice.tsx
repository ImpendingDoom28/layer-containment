import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { UITypography } from "../ui/UITypography";
import { UIButton } from "../ui/buttons/UIButton";
import { UICard, UICardAction, UICardContent, UICardHeader, UICardTitle } from "../ui/UICard";
import { HUDWrapper } from "./HUDWrapper";
import {
  dismissUpdateFailureSelector,
  isUpdateFailureDismissedSelector,
  updateStatusSelector,
  useUpdateStore,
} from "../../core/pwa/useUpdateStore";

/**
 * Non-blocking bottom banner for the background update flow:
 * - "failed": the new version could not be downloaded in time (the game
 *   keeps running on the last saved version; the retry happens on the next
 *   launch). Dismissible for this launch.
 * - "ready" mid-run: a new version is fully cached but the run is in
 *   progress, so the page reloads itself as soon as the player returns to
 *   the main menu (the GamePage's auto-reload effect handles that).
 * Returns null when nothing needs to be said: the auto-reload case in the
 * main menu (a "ready" update reloads automatically instead of prompting).
 */
type HUDUpdateNoticeProps = {
  /**
   * The current game status — a "ready" update mid-run must not reload the
   * page, it waits for the player to return to the main menu.
   */
  gameStatus: string;
};

export const HUDUpdateNotice: FC<HUDUpdateNoticeProps> = ({ gameStatus }) => {
  const { t } = useTranslation();
  const status = useUpdateStore(updateStatusSelector);
  const isFailureDismissed = useUpdateStore(isUpdateFailureDismissedSelector);
  const dismissUpdateFailure = useUpdateStore(dismissUpdateFailureSelector);

  const showFailure = status === "failed" && !isFailureDismissed;
  const showRestart = status === "ready" && gameStatus !== "menu";
  if (!showFailure && !showRestart) return null;

  return (
    <HUDWrapper
      className="pointer-events-none flex items-end justify-center p-4"
      data-testid="hud-update-notice"
    >
      <div className="pointer-events-auto w-[min(92vw,24rem)]">
        {showFailure ? (
          <UICard className="bg-card/90" data-testid="update-failure-banner">
            <UICardHeader>
              <UICardTitle>
                <Icon name="AlertTriangle" color="destructive" size={20} />
                <UITypography variant="medium" className="text-foreground">
                  {t("common.updateFailed")}
                </UITypography>
              </UICardTitle>
              <UICardAction>
                <UIButton
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.dismiss")}
                  data-testid="update-failure-dismiss"
                  onClick={dismissUpdateFailure}
                >
                  <Icon name="X" size={16} />
                </UIButton>
              </UICardAction>
            </UICardHeader>
            <UICardContent>
              <UITypography
                variant="small"
                className="whitespace-pre-wrap break-words text-muted-foreground"
              >
                {t("common.updateFailedHint")}
              </UITypography>
            </UICardContent>
          </UICard>
        ) : (
          <UICard className="bg-card/90" data-testid="update-ready-banner">
            <UICardHeader>
              <UICardTitle>
                <Icon name="CheckCircle2" color="emerald" size={20} />
                <UITypography variant="medium" className="text-foreground">
                  {t("common.updateReadyTitle")}
                </UITypography>
              </UICardTitle>
            </UICardHeader>
            <UICardContent>
              <UITypography
                variant="small"
                className="whitespace-pre-wrap break-words text-muted-foreground"
              >
                {t("common.updateReadyHint")}
              </UITypography>
            </UICardContent>
          </UICard>
        )}
      </div>
    </HUDWrapper>
  );
};
