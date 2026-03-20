import { Box, MousePointer2, Route, Eraser, ChevronLeft } from "lucide-react";

import { UIButton } from "../../ui/UIButton";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorMode, LevelEditorTool } from "../../../core/types/editor";

type ModeEntry = {
  mode: LevelEditorMode;
  defaultTool: LevelEditorTool;
  icon: typeof MousePointer2;
  label: string;
  accentClass: string;
};

const MODES: ModeEntry[] = [
  { mode: "select", defaultTool: "select", icon: MousePointer2, label: "Select", accentClass: "bg-zinc-600" },
  { mode: "path", defaultTool: "drawPath", icon: Route, label: "Path", accentClass: "bg-violet-600" },
  { mode: "building", defaultTool: "placeBuilding", icon: Box, label: "Building", accentClass: "bg-blue-600" },
  { mode: "erase", defaultTool: "erase", icon: Eraser, label: "Erase", accentClass: "bg-red-600" },
];

const TOOL_TO_MODE: Record<LevelEditorTool, LevelEditorMode> = {
  select: "select",
  placeBuilding: "building",
  drawPath: "path",
  setSpawn: "path",
  setBase: "path",
  erase: "erase",
};

type LevelEditorModeRailProps = {
  onBackToGame: () => void;
};

export const LevelEditorModeRail = ({ onBackToGame }: LevelEditorModeRailProps) => {
  const { activeTool, setActiveTool } = useLevelEditorStore();
  const activeMode = TOOL_TO_MODE[activeTool];

  return (
    <div className="pointer-events-auto flex flex-col gap-1.5 bg-card p-2 shadow-2xl">
      <UIButton
        variant="ghost"
        size="icon-sm"
        onClick={onBackToGame}
        title="Back to game"
      >
        <ChevronLeft />
      </UIButton>

      <div className="my-1 h-px bg-border" />

      {MODES.map(({ mode, defaultTool, icon: Icon, label, accentClass }) => {
        const isActive = activeMode === mode;

        return (
          <UIButton
            key={mode}
            variant={isActive ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setActiveTool(defaultTool)}
            title={label}
            className={isActive ? `${accentClass} hover:opacity-90` : ""}
          >
            <Icon />
          </UIButton>
        );
      })}
    </div>
  );
};
