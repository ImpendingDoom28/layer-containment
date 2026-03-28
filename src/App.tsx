import { FC } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { GamePage } from "./components/pages/GamePage";
import { LevelEditorPage } from "./components/pages/LevelEditorPage";
import { useAudioSystem } from "./core/hooks/useAudioSystem";
import { EntityIdProvider } from "./core/contexts/EntityIdContext";

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
            <LevelEditorPage onBackToGame={() => navigate("/")} />
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
