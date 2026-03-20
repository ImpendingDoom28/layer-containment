import { HUDWrapper } from "../HUDWrapper";

import { LevelEditorModeRail } from "./LevelEditorModeRail";
import { LevelEditorInspector } from "./LevelEditorInspector";

type HUDLevelEditorShellProps = {
  onBackToGame: () => void;
};

export const HUDLevelEditorShell = ({ onBackToGame }: HUDLevelEditorShellProps) => {
  return (
    <>
      <HUDWrapper className="pointer-events-none">
        <div className="flex h-full flex-col items-start p-4 md:p-6">
          <LevelEditorModeRail onBackToGame={onBackToGame} />
        </div>
      </HUDWrapper>

      <LevelEditorInspector />
    </>
  );
};
