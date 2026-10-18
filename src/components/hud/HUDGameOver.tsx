import {
  FC,
  useEffect,
  useState,
  type AnimationEvent,
} from "react";
import { useTranslation } from "react-i18next";

import type { GameStatus } from "../../core/types/game";
import { UIButton } from "../ui/buttons/UIButton";
import {
  UICard,
  UICardContent,
  UICardFooter,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import { UIMoney } from "../ui/UIMoney";
import { UITypography } from "../ui/UITypography";
import { cn } from "../ui/lib/twUtils";
import { HUDOverlay } from "./HUDOverlay";

type HUDGameOverProps = {
  gameStatus: GameStatus;
  currentWave: number;
  money: number;
  enemiesKilled: number;
  onRestart: () => void;
  onGoToMainMenu: () => void;
};

export const HUDGameOver: FC<HUDGameOverProps> = ({
  gameStatus,
  currentWave,
  money,
  enemiesKilled,
  onRestart,
  onGoToMainMenu,
}) => {
  const { t } = useTranslation();

  // Keep the overlay mounted through its exit animation: `hasOpened` stays
  // true while the card slides out, then everything resets and it unmounts.
  const [hasOpened, setHasOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  // The game keeps running while the result screen animates out; remember the
  // final stats so they stay stable during the exit.
  const [frozen, setFrozen] = useState({ currentWave, money, enemiesKilled });

  const isEnd = gameStatus === "gameOver" || gameStatus === "won";

  useEffect(() => {
    if (isEnd) {
      setFrozen({ currentWave, money, enemiesKilled });
      setHasOpened(true);
      setClosing(false);
    } else if (hasOpened) {
      setClosing(true);
    }
  }, [isEnd, hasOpened, currentWave, money, enemiesKilled]);

  const handleCardAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    // Only the card's own exit animation unmounts the overlay (child
    // animations bubble up, so check the target).
    if (event.target === event.currentTarget && event.animationName === "exit") {
      setHasOpened(false);
      setClosing(false);
    }
  };

  if (!hasOpened) return null;

  const isWin = gameStatus === "won";

  return (
    <HUDOverlay className={cn(closing && "pointer-events-none")}>
      <UICard
        className={cn(
          closing
            ? "animate-out fade-out slide-out-to-left-10 duration-300 ease-in"
            : "animate-in fade-in slide-in-from-left-10 duration-400 ease-out"
        )}
        onAnimationEnd={handleCardAnimationEnd}
      >
        <UICardHeader className="space-y-4">
          <UICardTitle className="justify-center">
            <UITypography
              variant="h1"
              className={isWin ? "text-green-400" : "text-red-400"}
            >
              {isWin ? t("gameOver.victory") : t("gameOver.gameOver")}
            </UITypography>
          </UICardTitle>
          {isWin && (
            <div className="p-4 text-center rounded bg-green-900/50">
              <UITypography variant="small" className="text-green-300">
                {t("gameOver.victoryMessage")}
              </UITypography>
            </div>
          )}

          {!isWin && (
            <div className="p-4 text-center rounded bg-red-900/50">
              <UITypography variant="small" className="text-red-300">
                {t("gameOver.defeatMessage")}
              </UITypography>
            </div>
          )}
        </UICardHeader>

        <UICardContent className="gap-4">
          <div className="flex flex-row items-center justify-center gap-4">
            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.finalMoney")}
              </UITypography>
              <div className="flex items-center justify-center">
                <UIMoney money={frozen.money} variant="h3" iconSize={20} />
              </div>
            </div>

            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.enemiesKilled")}
              </UITypography>
              <UITypography variant="h3">{frozen.enemiesKilled}</UITypography>
            </div>
            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                {t("gameOver.wavesSurvived")}
              </UITypography>
              <UITypography variant="h3">{frozen.currentWave} / 7</UITypography>
            </div>
          </div>
        </UICardContent>

        <UICardFooter className="flex flex-row justify-end gap-3">
          <UIButton onClick={onGoToMainMenu} variant={"ghost"}>
            {t("gameOver.goToMainMenu")}
          </UIButton>
          <UIButton onClick={onRestart}>{t("gameOver.playAgain")}</UIButton>
        </UICardFooter>
      </UICard>
    </HUDOverlay>
  );
};
