import { FC } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";

import { GamePage } from "./components/pages/GamePage";
import { LevelEditorPage } from "./components/pages/LevelEditorPage";
import { useAudioSystem } from "./core/hooks/useAudioSystem";

const AppRoutes: FC = () => {
  const navigate = useNavigate();

  useAudioSystem();

  return (
    <Routes>
      <Route
        path="/"
        element={<GamePage onOpenLevelEditor={() => navigate("/editor")} />}
      />
      <Route
        path="/editor"
        element={<LevelEditorPage onBackToGame={() => navigate("/")} />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export const App: FC = () => {
  return <AppRoutes />;
};
