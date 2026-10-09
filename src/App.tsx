import { FC, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { WorldProvider } from "koota/react";

import { HUDLoading } from "./components/hud/HUDLoading";
import { GamePage } from "./components/pages/GamePage";
import { EntityIdProvider } from "./core/contexts/EntityIdContext";
import { useGameAudioSystem } from "./core/audio/useGameAudioSystem";
import { editorWorld, world } from "./core/ecs/world";

const LevelEditorPage = lazy(() =>
  import("./components/pages/LevelEditorPage").then((mod) => ({
    default: mod.LevelEditorPage,
  }))
);

const EcsPage = lazy(() =>
  import("./tower-defence-ecs/EcsPage").then((mod) => ({
    default: mod.EcsPage,
  }))
);

const AppRoutes: FC = () => {
  const navigate = useNavigate();

  useGameAudioSystem();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <WorldProvider world={world}>
            <EntityIdProvider>
              <GamePage onOpenLevelEditor={() => navigate("/editor")} />
            </EntityIdProvider>
          </WorldProvider>
        }
      />
      <Route
        path="/editor"
        element={
          <WorldProvider world={editorWorld}>
            <EntityIdProvider>
              <Suspense
                fallback={
                  <HUDLoading
                    className="fixed inset-0"
                    message="Loading editor..."
                  />
                }
              >
                <LevelEditorPage onBackToGame={() => navigate("/")} />
              </Suspense>
            </EntityIdProvider>
          </WorldProvider>
        }
      />
      <Route
        path="/ecs"
        element={
          <WorldProvider world={world}>
            <Suspense
              fallback={
                <HUDLoading
                  className="fixed inset-0"
                  message="Loading ECS page..."
                />
              }
            >
              <EcsPage />
            </Suspense>
          </WorldProvider>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: FC = () => {
  return <AppRoutes />;
};
