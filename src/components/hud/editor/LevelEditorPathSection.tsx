import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { Plus, Trash2 } from "lucide-react";

import {
  pathWidthSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorTool } from "../../../core/types/editor";
import { waypointToTileUnclamped } from "../../../utils/levelEditor";
import {
  UIAccordionContent,
  UIAccordionItem,
  UIAccordionTrigger,
} from "../../ui/UIAccordion";
import { UIButton } from "../../ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";

import { EDITOR_PATH_SUBTOOL_ACTIVE_CLASS } from "./editorModeAccents";
import { EditorGridPositionFields } from "./EditorGridPositionFields";
import { EditorSection } from "./EditorSection";
import { EditorEmptyState } from "./EditorEmptyState";

type PathSubToolKey =
  | "editor.pathSubToolDraw"
  | "editor.pathSubToolSpawn"
  | "editor.pathSubToolBase";

const PATH_SUB_TOOLS: Array<{ tool: LevelEditorTool; label: PathSubToolKey }> = [
  { tool: "drawPath", label: "editor.pathSubToolDraw" },
  { tool: "setSpawn", label: "editor.pathSubToolSpawn" },
  { tool: "setBase", label: "editor.pathSubToolBase" },
];

const getPathButtonKey = (pathIndex: number, pathLength: number) =>
  `path-button-${pathIndex}-${pathLength}`;

export const LevelEditorPathSection = () => {
  const { t } = useTranslation();
  const tileSize = useGameStore(tileSizeSelector);
  const pathWidth = useGameStore(pathWidthSelector);
  const {
    draftLevel,
    activeTool,
    selected,
    selectedPathIndex,
    setActiveTool,
    addPath,
    selectPath,
    removeSelectedPath,
    updateSelectedWaypoint,
    removeSelectedWaypoint,
  } = useLevelEditorStore();

  const selectedPath = draftLevel.pathWaypoints[selectedPathIndex] ?? [];

  const selectedWaypoint =
    selected?.type === "waypoint"
      ? (draftLevel.pathWaypoints[selected.pathIndex]?.[
          selected.waypointIndex
        ] ?? null)
      : null;

  const selectedWaypointTile = useMemo(() => {
    if (!selectedWaypoint) return null;
    return waypointToTileUnclamped(
      selectedWaypoint,
      draftLevel.gridSize,
      tileSize
    );
  }, [draftLevel.gridSize, selectedWaypoint, tileSize]);

  const isPathTool =
    activeTool === "drawPath" ||
    activeTool === "setSpawn" ||
    activeTool === "setBase";

  return (
    <UIAccordionItem value="path">
      <UIAccordionTrigger>{t("editor.pathTab")}</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          {PATH_SUB_TOOLS.map(({ tool, label }) => (
            <UIButton
              key={tool}
              size="xs"
              variant={activeTool === tool ? "default" : "outline"}
              onClick={() => setActiveTool(tool)}
              className={
                activeTool === tool ? EDITOR_PATH_SUBTOOL_ACTIVE_CLASS : ""
              }
            >
              {t(label)}
            </UIButton>
          ))}
        </div>

        <div className="flex gap-2">
          <UIButton size="sm" variant="outline" onClick={addPath}>
            <Plus />
            {t("editor.addPath")}
          </UIButton>
          <UIButton
            size="sm"
            variant="destructive"
            onClick={removeSelectedPath}
          >
            <Trash2 />
            {t("editor.remove")}
          </UIButton>
        </div>

        {draftLevel.pathWaypoints.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {draftLevel.pathWaypoints.map((path, pathIndex) => (
              <UIButton
                key={getPathButtonKey(pathIndex, path.length)}
                size="xs"
                variant={
                  pathIndex === selectedPathIndex ? "default" : "outline"
                }
                onClick={() => selectPath(pathIndex)}
              >
                {t("editor.pathButton", { index: pathIndex + 1, count: path.length })}
              </UIButton>
            ))}
          </div>
        ) : null}

        <EditorSection>
          <UITypography variant="medium">
            {t("editor.pathNumber", { index: selectedPathIndex + 1 })}
          </UITypography>
          <UITypography
            variant="verySmall"
            className="mt-1 text-muted-foreground"
          >
            {isPathTool
              ? t("editor.clickTilesToWaypoint")
              : t("editor.switchPathTool")}
          </UITypography>
          <UITypography variant="small" className="mt-2">
            {t("editor.waypoints", { count: selectedPath.length })}
          </UITypography>
        </EditorSection>

        {selectedWaypoint && selectedWaypointTile ? (
          <EditorSection className="flex flex-col gap-3">
            <UITypography variant="medium">
              {t("editor.waypoint")}
            </UITypography>
            <EditorGridPositionFields
              gridX={selectedWaypointTile.gridX}
              gridZ={selectedWaypointTile.gridZ}
              onChangeGridX={(gridX) =>
                updateSelectedWaypoint(
                  { gridX, gridZ: selectedWaypointTile.gridZ },
                  tileSize,
                  pathWidth
                )
              }
              onChangeGridZ={(gridZ) =>
                updateSelectedWaypoint(
                  { gridX: selectedWaypointTile.gridX, gridZ },
                  tileSize,
                  pathWidth
                )
              }
            />
            <UIButton
              variant="destructive"
              size="sm"
              onClick={removeSelectedWaypoint}
            >
              <Trash2 />
              {t("editor.removeWaypoint")}
            </UIButton>
          </EditorSection>
        ) : (
          <EditorEmptyState message={t("editor.noWaypointSelected")} />
        )}
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
