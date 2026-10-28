import { FC, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { WorldProvider } from "koota/react";
import { useTranslation } from "react-i18next";

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

const TestingLevelPage = lazy(() =>
  import("./components/pages/TestingLevelPage").then((mod) => ({
    default: mod.TestingLevelPage,
  }))
);

const AppRoutes: FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useGameAudioSystem();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <WorldProvider world={world}>
            <EntityIdProvider>
              <GamePage
              onOpenLevelEditor={() => navigate("/editor")}
              onOpenTestingLevel={() => navigate("/testing-level")}
            />
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
                    message={t("common.loadingEditor")}
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
        path="/testing-level"
        element={
          <WorldProvider world={world}>
            <EntityIdProvider>
              <Suspense
                fallback={
                  <HUDLoading
                    className="fixed inset-0"
                    message={t("common.loading")}
                  />
                }
              >
                <TestingLevelPage onBackToMenu={() => navigate("/")} />
              </Suspense>
            </EntityIdProvider>
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
