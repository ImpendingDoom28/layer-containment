import { FC, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { HUDLoading } from "./components/hud/HUDLoading";
import { GamePage } from "./components/pages/GamePage";
import { EntityIdProvider } from "./core/contexts/EntityIdContext";
import { useGameAudioSystem } from "./core/audio/useGameAudioSystem";

const LevelEditorPage = lazy(() =>
  import("./components/pages/LevelEditorPage").then((mod) => ({
    default: mod.LevelEditorPage,
  }))
);

const DevHoldButtonPage = lazy(() =>
  import("./components/pages/DevHoldButtonPage").then((mod) => ({
    default: mod.DevHoldButtonPage,
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
          <EntityIdProvider>
            <GamePage onOpenLevelEditor={() => navigate("/editor")} />
          </EntityIdProvider>
        }
      />
      <Route
        path="/editor"
        element={
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
        }
      />
      {import.meta.env.DEV ? (
        <Route
          path="/dev/hold-button"
          element={
            <Suspense
              fallback={
                <HUDLoading
                  className="fixed inset-0"
                  message="Loading dev page..."
                />
              }
            >
              <DevHoldButtonPage />
            </Suspense>
          }
        />
      ) : null}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: FC = () => {
  return <AppRoutes />;
};
