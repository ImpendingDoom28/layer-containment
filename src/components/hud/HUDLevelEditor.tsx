import { HUDLevelEditorShell } from "./editor/HUDLevelEditorShell";

type HUDLevelEditorProps = {
  onBackToGame: () => void;
};

export const HUDLevelEditor = ({ onBackToGame }: HUDLevelEditorProps) => {
  return <HUDLevelEditorShell onBackToGame={onBackToGame} />;
};
