import { Suspense, useCallback } from "react";
import { Canvas } from "@react-three/fiber";

import { HUDLoading } from "../hud/HUDLoading";
import { HUDLevelEditor } from "../hud/HUDLevelEditor";
import { LevelEditorScene } from "../scenes/editor/LevelEditorScene";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import { PageWrapper } from "./PageWrapper";

type LevelEditorPageProps = {
  onBackToGame: () => void;
};

const canvasStyle = { width: "100%", height: "100%" };
const canvasGl = { antialias: true };

export const LevelEditorPage = ({ onBackToGame }: LevelEditorPageProps) => {
  const { isGameConfigLoaded } = useGameSystem();

  const onNavigateBack = useCallback(() => {
    onBackToGame();
  }, [onBackToGame]);

  return (
    <PageWrapper>
      {isGameConfigLoaded ? null : <HUDLoading message="Loading editor..." />}

      <Canvas style={canvasStyle} gl={canvasGl}>
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
