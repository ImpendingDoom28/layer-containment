import { Suspense, useCallback } from "react";
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

  const onNavigateBack = useCallback(() => {
    onBackToGame();
  }, [onBackToGame]);

  return (
    <PageWrapper>
      {isGameConfigLoaded ? null : (
        <HUDLoading message={t("common.loadingEditor")} />
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
