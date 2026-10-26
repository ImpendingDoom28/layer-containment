import { Suspense, useCallback, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useTranslation } from "react-i18next";

import { HUDLoading } from "../hud/HUDLoading";
import { HUDLevelEditor } from "../hud/HUDLevelEditor";
import { LevelEditorScene } from "../scenes/editor/LevelEditorScene";
import { GAME_CANVAS_GL, GAME_CANVAS_STYLE } from "../../constants/canvas";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { PageWrapper } from "./PageWrapper";

type LevelEditorPageProps = {
  onBackToGame: () => void;
};

export const LevelEditorPage = ({ onBackToGame }: LevelEditorPageProps) => {
  const { t } = useTranslation();
  const { isGameConfigLoaded } = useGameSystem();

  const [isShowingLoading, setIsShowingLoading] = useState(true);
  const [isClosingLoading, setIsClosingLoading] = useState(false);

  // Loading stays mounted while its text slides out; only the finished
  // animation (or the reduced-motion path) unmounts it.
  useEffect(() => {
    if (isGameConfigLoaded && isShowingLoading) {
      setIsClosingLoading(true);
    }
  }, [isGameConfigLoaded, isShowingLoading]);

  const handleLoadingExited = useCallback(() => {
    setIsShowingLoading(false);
    setIsClosingLoading(false);
  }, []);

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

      <Canvas
        data-testid="editor-canvas"
        style={GAME_CANVAS_STYLE}
        gl={GAME_CANVAS_GL}
      >
        <Suspense fallback={null}>
          {isGameConfigLoaded ? <LevelEditorScene /> : null}
        </Suspense>
      </Canvas>

      {isGameConfigLoaded ? (
        <HUDLevelEditor onBackToGame={onNavigateBack} />
      ) : null}
    </PageWrapper>
  );
};
