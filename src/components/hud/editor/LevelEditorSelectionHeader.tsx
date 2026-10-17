import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { UITypography } from "../../ui/UITypography";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorMode, LevelEditorTool } from "../../../core/types/editor";
import { EDITOR_MODE_LABEL_KEYS } from "./editorModeLabels";

const TOOL_TO_MODE: Record<LevelEditorTool, LevelEditorMode> = {
  select: "select",
  placeBuilding: "building",
  drawPath: "path",
  setSpawn: "path",
  setBase: "path",
  erase: "erase",
  water: "water",
};

const MODE_DOT_COLORS: Record<LevelEditorMode, string> = {
  select: "bg-zinc-400",
  path: "bg-violet-400",
  building: "bg-blue-400",
  water: "bg-cyan-400",
  erase: "bg-red-400",
};

export const LevelEditorSelectionHeader = () => {
  const { t } = useTranslation();
  const { activeTool, selected, hasUnsavedChanges } = useLevelEditorStore();
  const activeMode = TOOL_TO_MODE[activeTool];

  const selectionLabel = useMemo(() => {
    if (!selected) return null;

    if (selected.type === "building")
      return t("editor.buildingSelection", { id: selected.id });
    if (selected.type === "waypoint") {
      return t("editor.waypointSelection", {
        waypoint: selected.waypointIndex + 1,
        path: selected.pathIndex + 1,
      });
    }
    return t("editor.pathSelection", { path: selected.pathIndex + 1 });
  }, [selected, t]);

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-full ${MODE_DOT_COLORS[activeMode]}`} />
        <UITypography variant="medium">
          {t(EDITOR_MODE_LABEL_KEYS[activeMode])}
        </UITypography>
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
        <span
          className="size-1.5 rounded-full bg-amber-400"
          title={t("editor.unsavedChanges")}
        />
      ) : null}
    </div>
  );
};
