import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";
import { useTranslation } from "react-i18next";

import { HUDLoading } from "../hud/HUDLoading";
import { HUDTestingLevel } from "../hud/HUDTestingLevel";
import { TestingLevelScene } from "../scenes/testingLevel/TestingLevelScene";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../constants/canvas";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { useLoadingTransition } from "../../core/hooks/useLoadingTransition";
import { PageWrapper } from "./PageWrapper";

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

      <Canvas
        data-testid="testing-level-canvas"
        style={GAME_CANVAS_STYLE}
        gl={GAME_CANVAS_GL}
      >
        <Suspense fallback={null}>
          {isGameConfigLoaded ? <TestingLevelScene /> : null}
        </Suspense>
      </Canvas>

      {isGameConfigLoaded ? (
        <HUDTestingLevel onBackToGame={onNavigateBack} />
      ) : null}
    </PageWrapper>
  );
};
