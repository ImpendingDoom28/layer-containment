import { Suspense, useCallback } from "react";
import { useTranslation } from "react-i18next";

import { HUDLoading } from "../hud/HUDLoading";
import { HUDTestingLevel } from "../hud/HUDTestingLevel";
import { TestingLevelScene } from "../scenes/testingLevel/TestingLevelScene";
import { PostFX } from "../scenes/shared/PostFX";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useLoadingTransition } from "../../core/hooks/useLoadingTransition";
import { SimulationClockProvider } from "../../core/contexts/SimulationClockContext";
import { WaterClockProvider } from "../../core/contexts/WaterClockContext";
import { PageWrapper } from "./PageWrapper";
import { AppCanvas } from "../scenes/shared/AppCanvas";

type TestingLevelPageProps = {
  onBackToMenu: () => void;
};

export const TestingLevelPage = ({ onBackToMenu }: TestingLevelPageProps) => {
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
    onBackToMenu();
  }, [onBackToMenu]);

  return (
    <PageWrapper>
      {isShowingLoading && (
        <HUDLoading
          message={t("common.loading")}
          closing={isClosingLoading}
          onExited={handleLoadingExited}
        />
      )}

      <AppCanvas testId="testing-level-canvas">
        <SimulationClockProvider>
          <WaterClockProvider>
            <Suspense fallback={null}>
              {isGameConfigLoaded ? <TestingLevelScene /> : null}
            </Suspense>

            <PostFX />
          </WaterClockProvider>
        </SimulationClockProvider>
      </AppCanvas>

      {isGameConfigLoaded ? (
        <HUDTestingLevel onBackToGame={onNavigateBack} />
      ) : null}
    </PageWrapper>
  );
};
