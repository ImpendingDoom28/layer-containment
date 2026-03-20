import { useMemo } from "react";

import { UITypography } from "../../ui/UITypography";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorMode, LevelEditorTool } from "../../../core/types/editor";

const TOOL_TO_MODE: Record<LevelEditorTool, LevelEditorMode> = {
  select: "select",
  placeBuilding: "building",
  drawPath: "path",
  setSpawn: "path",
  setBase: "path",
  erase: "erase",
};

const MODE_LABELS: Record<LevelEditorMode, string> = {
  select: "Select",
  path: "Path",
  building: "Building",
  erase: "Erase",
};

const MODE_DOT_COLORS: Record<LevelEditorMode, string> = {
  select: "bg-zinc-400",
  path: "bg-violet-400",
  building: "bg-blue-400",
  erase: "bg-red-400",
};

export const LevelEditorSelectionHeader = () => {
  const { activeTool, selected, hasUnsavedChanges } = useLevelEditorStore();
  const activeMode = TOOL_TO_MODE[activeTool];

  const selectionLabel = useMemo(() => {
    if (!selected) return null;

    if (selected.type === "building") return `Building #${selected.id}`;
    if (selected.type === "waypoint") {
      return `Waypoint ${selected.waypointIndex + 1} · Path ${selected.pathIndex + 1}`;
    }
    return `Path ${selected.pathIndex + 1}`;
  }, [selected]);

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${MODE_DOT_COLORS[activeMode]}`} />
        <UITypography variant="medium">{MODE_LABELS[activeMode]}</UITypography>
        {selectionLabel ? (
          <>
            <span className="text-muted-foreground">·</span>
            <UITypography variant="verySmall" className="text-muted-foreground">
              {selectionLabel}
            </UITypography>
          </>
        ) : null}
      </div>
      {hasUnsavedChanges ? (
        <span className="size-1.5 rounded-full bg-amber-400" title="Unsaved changes" />
      ) : null}
    </div>
  );
};
