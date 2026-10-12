import { FC, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

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
  UICardDescription,
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
          <UICard className={cn("w-full", className)}>
            <UICardHeader>
              <UICardTitle>
                <UIButton
                  onClick={() => startClose(onResume)}
                  variant="ghost"
                  size="icon"
                  aria-label="Resume"
                >
                  <ArrowLeft />
                </UIButton>
                <UITypography variant="h4">Game Menu</UITypography>
              </UICardTitle>
              <UICardDescription>
                Paused — resume combat, restart the mission, or return to
                headquarters.
              </UICardDescription>
            </UICardHeader>
            <UICardContent className="flex flex-col gap-1">
              <UIButton
                onClick={() => startClose(onResume)}
                className="justify-between text-sm text-left group text-foreground"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  Continue
                </span>
                <ArrowRight className="transition-transform size-4 group-hover:translate-x-1" />
              </UIButton>
              <UIButton
                onClick={() => setShowRestartConfirm(true)}
                variant="secondary"
                className="mt-2 justify-between text-sm text-left group text-foreground hover:border-primary/30"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  Restart
                </span>
                <ArrowRight className="transition-transform size-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary" />
              </UIButton>
              <UIButton
                onClick={() => setShowSettings(true)}
                variant="outline"
                className="justify-between text-sm text-left group text-foreground hover:border-primary/30"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  Settings
                </span>
                <ArrowRight className="transition-transform size-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary" />
              </UIButton>
              <UIButton
                onClick={() => setShowExitConfirm(true)}
                variant="secondary"
                className="justify-between text-sm text-left group text-foreground hover:border-primary/30"
              >
                <span className="transition-transform group-hover:translate-x-1">
                  Go to Main Menu
                </span>
                <ArrowRight className="transition-transform size-4 text-muted-foreground group-hover:translate-x-1 group-hover:text-primary" />
              </UIButton>
            </UICardContent>
          </UICard>
        )}
      </HUDSidePanel>
      <UIConfirmModal
        open={showExitConfirm}
        title="Exit game"
        message="Are you sure you want to exit? All unsaved changes will be lost"
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowExitConfirm(false);
          startCloseImmediate(onGoToMainMenu);
        }}
        onOpenChange={setShowExitConfirm}
      />
      <UIConfirmModal
        open={showRestartConfirm}
        title="Restart game"
        message="Are you sure you want to restart?"
        confirmLabel="Proceed"
        cancelLabel="Cancel"
        onConfirm={() => {
          setShowRestartConfirm(false);
          startCloseImmediate(onRestart);
        }}
        onOpenChange={setShowRestartConfirm}
      />
    </>
  );
};
