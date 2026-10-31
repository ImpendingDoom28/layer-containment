import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import type { GameStatus } from "../../core/types/game";
import {
  setShowSettingsSelector,
  showSettingsSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import type { HeldClose } from "../../core/hooks/useHeldClose";
import { UIButton } from "../ui/buttons/UIButton";
import {
  UICard,
  UICardContent,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import { UIConfirmModal } from "../ui/UIConfirmModal";
import { UITypography } from "../ui/UITypography";
import { cn } from "../ui/lib/twUtils";
import { HUDSettings } from "./HUDSettings";
import { HUDSidePanel } from "./HUDSidePanel";
import { BlurBackdrop } from "./main/BlurBackdrop";
import { useBlurBackdrop } from "../../core/hooks/utils/useBlurBackdrop";

type HUDGameMenuProps = {
  gameStatus: GameStatus;
  close: HeldClose;
  onResume: () => void | Promise<void>;
  onRestart: () => void | Promise<void>;
  onGoToMainMenu: () => void | Promise<void>;
  className?: string;
};

export const HUDGameMenu: FC<HUDGameMenuProps> = ({
  gameStatus,
  close,
  onResume,
  onRestart,
  onGoToMainMenu,
  className,
}) => {
  const { t } = useTranslation();
  const { closing, startClose, startCloseImmediate, finishClose, cancelClose } =
    close;
  const { menuRef, blurDimensions, setBlurDimensions } = useBlurBackdrop();
  const setShowSettings = useGameStore(setShowSettingsSelector);
  const showSettings = useGameStore(showSettingsSelector);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showRestartConfirm, setShowRestartConfirm] = useState(false);

  useEffect(() => {
    if (gameStatus !== "gameMenu") {
      cancelClose();
      setShowSettings(false);
      setShowExitConfirm(false);
      setShowRestartConfirm(false);
    }
  }, [gameStatus]);

  const handleBackdropFaded = () => {
    setShowSettings(false);
    finishClose(onResume);
  };

  if (gameStatus !== "gameMenu") return null;

  return (
    <>
      <BlurBackdrop
        isMenu={false}
        blurDimensions={blurDimensions}
        setBlurDimensions={setBlurDimensions}
        menuRef={menuRef}
        hasInteracted
        fading={closing}
        onFaded={handleBackdropFaded}
      />
      <HUDSidePanel side="left" menuRef={menuRef} closing={closing}>
        {showSettings ? (
          <HUDSettings className="w-full" />
        ) : (
          <UICard className={cn("h-full w-full bg-transparent", className)}>
            <UICardHeader>
              <UICardTitle>
                <UIButton
                  onClick={() => startClose(onResume)}
                  variant="ghost"
                  size="icon"
                  aria-label={t("gameMenu.resume")}
                >
                  <Icon name="ArrowLeft" />
                </UIButton>
                <UITypography variant="h4">
                  {t("gameMenu.title")}
                </UITypography>
              </UICardTitle>
            </UICardHeader>
            <UICardContent className="flex flex-col flex-1 min-h-0 gap-1 overflow-y-auto">
              <UIButton
                onClick={() => startClose(onResume)}
                className="justify-between text-sm text-left group text-foreground"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  {t("gameMenu.continue")}
                </span>
                <Icon name="ArrowRight" size={16} className="transition-transform group-hover:translate-x-1" />
              </UIButton>
              <UIButton
                onClick={() => setShowRestartConfirm(true)}
                variant="secondary"
                className="justify-between mt-2 text-sm text-left group text-foreground hover:border-primary/30"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  {t("gameMenu.restart")}
                </span>
                <Icon name="ArrowRight" color="muted" size={16} className="transition-transform group-hover:translate-x-1" />
              </UIButton>
              <UIButton
                onClick={() => setShowSettings(true)}
                variant="outline"
                className="justify-between text-sm text-left group text-foreground hover:border-primary/30"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  {t("gameMenu.settings")}
                </span>
                <Icon name="ArrowRight" color="muted" size={16} className="transition-transform group-hover:translate-x-1" />
              </UIButton>
              <UIButton
                onClick={() => setShowExitConfirm(true)}
                variant="secondary"
                className="justify-between text-sm text-left group text-foreground hover:border-primary/30"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  {t("gameMenu.goToMainMenu")}
                </span>
                <Icon name="ArrowRight" color="muted" size={16} className="transition-transform group-hover:translate-x-1" />
              </UIButton>
            </UICardContent>
          </UICard>
        )}
      </HUDSidePanel>
      <UIConfirmModal
        open={showExitConfirm}
        title={t("gameMenu.exitGame")}
        message={t("gameMenu.exitGameMessage")}
        confirmLabel={t("gameMenu.proceed")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          setShowExitConfirm(false);
          startCloseImmediate(onGoToMainMenu);
        }}
        onOpenChange={setShowExitConfirm}
      />
      <UIConfirmModal
        open={showRestartConfirm}
        title={t("gameMenu.restartGame")}
        message={t("gameMenu.restartGameMessage")}
        confirmLabel={t("gameMenu.proceed")}
        cancelLabel={t("common.cancel")}
        onConfirm={() => {
          setShowRestartConfirm(false);
          startCloseImmediate(onRestart);
        }}
        onOpenChange={setShowRestartConfirm}
      />
    </>
  );
};
