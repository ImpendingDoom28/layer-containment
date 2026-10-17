import { Box, Droplets, MousePointer2, Route, Eraser, ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorMode, LevelEditorTool } from "../../../core/types/editor";
import { UIButton } from "../../ui/buttons/UIButton";

import { EDITOR_MODE_LABEL_KEYS } from "./editorModeLabels";
import { EDITOR_PATH_MODE_ACCENT_BG_CLASS } from "./editorModeAccents";

type ModeEntry = {
  mode: LevelEditorMode;
  defaultTool: LevelEditorTool;
  icon: typeof MousePointer2;
  accentClass: string;
};

const MODES: ModeEntry[] = [
  { mode: "select", defaultTool: "select", icon: MousePointer2, accentClass: "bg-zinc-600" },
  {
    mode: "path",
    defaultTool: "drawPath",
    icon: Route,
    accentClass: EDITOR_PATH_MODE_ACCENT_BG_CLASS,
  },
  { mode: "building", defaultTool: "placeBuilding", icon: Box, accentClass: "bg-blue-600" },
  { mode: "water", defaultTool: "water", icon: Droplets, accentClass: "bg-cyan-600" },
  { mode: "erase", defaultTool: "erase", icon: Eraser, accentClass: "bg-red-600" },
];

const TOOL_TO_MODE: Record<LevelEditorTool, LevelEditorMode> = {
  select: "select",
  placeBuilding: "building",
  drawPath: "path",
  setSpawn: "path",
  setBase: "path",
  erase: "erase",
  water: "water",
};

type LevelEditorModeRailProps = {
  onBackToGame: () => void;
};

export const LevelEditorModeRail = ({ onBackToGame }: LevelEditorModeRailProps) => {
  const { t } = useTranslation();
  const { activeTool, setActiveTool } = useLevelEditorStore();
  const activeMode = TOOL_TO_MODE[activeTool];

  return (
    <div className="pointer-events-auto flex flex-col gap-1.5 bg-card p-2 shadow-2xl">
      <UIButton
        variant="ghost"
        size="icon-sm"
        onClick={onBackToGame}
        title={t("editor.backToGame")}
      >
        <ChevronLeft />
      </UIButton>

      <div className="my-1 h-px bg-border" />

      {MODES.map(({ mode, defaultTool, icon: Icon, accentClass }) => {
        const isActive = activeMode === mode;

        return (
          <UIButton
            key={mode}
            variant={isActive ? "default" : "ghost"}
            size="icon-sm"
            onClick={() => setActiveTool(defaultTool)}
            title={t(EDITOR_MODE_LABEL_KEYS[mode])}
            className={isActive ? `${accentClass} hover:opacity-90` : ""}
          >
            <Icon />
          </UIButton>
        );
      })}
    </div>
  );
};
