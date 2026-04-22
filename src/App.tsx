import { FC, lazy, Suspense } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { HUDLoading } from "./components/hud/HUDLoading";
import { GamePage } from "./components/pages/GamePage";
import { useAudioSystem } from "./core/hooks/useAudioSystem";
import { EntityIdProvider } from "./core/contexts/EntityIdContext";

const LevelEditorPage = lazy(() =>
  import("./components/pages/LevelEditorPage").then((mod) => ({
    default: mod.LevelEditorPage,
  }))
);

const AppRoutes: FC = () => {
  const navigate = useNavigate();

  useAudioSystem();

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
              fallback={<HUDLoading className="fixed inset-0" message="Loading editor..." />}
            >
              <LevelEditorPage onBackToGame={() => navigate("/")} />
            </Suspense>
          </EntityIdProvider>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: FC = () => {
  return <AppRoutes />;
};
