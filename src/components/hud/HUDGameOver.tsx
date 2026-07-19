import { FC } from "react";

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
  if (gameStatus !== "gameOver" && gameStatus !== "won") return null;

  const isWin = gameStatus === "won";

  return (
    <HUDOverlay>
      <UICard>
        <UICardHeader className="space-y-4">
          <UICardTitle className="justify-center">
            <UITypography
              variant="h1"
              className={isWin ? "text-green-400" : "text-red-400"}
            >
              {isWin ? "Victory!" : "Game Over"}
            </UITypography>
          </UICardTitle>
          {isWin && (
            <div className="p-4 text-center rounded bg-green-900/50">
              <UITypography variant="small" className="text-green-300">
                Congratulations! You defended against all waves!
              </UITypography>
            </div>
          )}

          {!isWin && (
            <div className="p-4 text-center rounded bg-red-900/50">
              <UITypography variant="small" className="text-red-300">
                The enemies broke through your defenses!
              </UITypography>
            </div>
          )}
        </UICardHeader>

        <UICardContent className="gap-4">
          <div className="flex flex-row items-center justify-center gap-4">
            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                Final Money
              </UITypography>
              <div className="flex items-center justify-center">
                <UIMoney money={money} variant="h3" iconSize={20} />
              </div>
            </div>

            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                Enemies Killed
              </UITypography>
              <UITypography variant="h3">{enemiesKilled}</UITypography>
            </div>
            <div className="text-center">
              <UITypography variant="small" className="text-muted-foreground">
                Waves Survived
              </UITypography>
              <UITypography variant="h3">{currentWave} / 7</UITypography>
            </div>
          </div>
        </UICardContent>

        <UICardFooter className="flex flex-row justify-end gap-3">
          <UIButton onClick={onGoToMainMenu} variant={"ghost"}>
            Go to Main Menu
          </UIButton>
          <UIButton onClick={onRestart}>Play Again</UIButton>
        </UICardFooter>
      </UICard>
    </HUDOverlay>
  );
};
