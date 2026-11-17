import { Suspense, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { HUDLoading } from "../hud/HUDLoading";
import { HUDLevelEditor } from "../hud/HUDLevelEditor";
import { LevelEditorScene } from "../scenes/editor/LevelEditorScene";
import { PostFX } from "../scenes/shared/PostFX";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useLoadingTransition } from "../../core/hooks/useLoadingTransition";
import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import { WaterClockProvider } from "../../core/contexts/WaterClockContext";
import { PageWrapper } from "./PageWrapper";
import { AppCanvas } from "../scenes/shared/AppCanvas";

type LevelEditorPageProps = {
  onBackToGame: () => void;
};

export const LevelEditorPage = ({ onBackToGame }: LevelEditorPageProps) => {
  const { t } = useTranslation();
  const { isGameConfigLoaded } = useGameSystem();

  // Loading stays mounted while its text slides out; only the finished
  // animation (or the reduced-motion path) unmounts it.
  const {
    isShowing: isShowingLoading,
    isClosing: isClosingLoading,
    onExited: handleLoadingExited,
  } = useLoadingTransition(isGameConfigLoaded);

  const onNavigateBack = useCallback(() => {
    onBackToGame();
  }, [onBackToGame]);

  return (
    <PageWrapper>
      {isShowingLoading && (
        <HUDLoading
          message={t("common.loadingEditor")}
          closing={isClosingLoading}
          onExited={handleLoadingExited}
        />
      )}

      <AppCanvas testId="editor-canvas">
        <SimulationClockProvider>
          <WaterClockProvider>
            <Suspense fallback={null}>
              {isGameConfigLoaded ? <LevelEditorScene /> : null}
            </Suspense>

            <PostFX />
          </WaterClockProvider>
        </SimulationClockProvider>
      </AppCanvas>

      {isGameConfigLoaded ? (
        <HUDLevelEditor onBackToGame={onNavigateBack} />
      ) : null}
    </PageWrapper>
  );
};
