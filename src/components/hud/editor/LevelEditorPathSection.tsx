import { useMemo } from "react";

import { Plus, Trash2 } from "lucide-react";

import { UIAccordionContent, UIAccordionItem, UIAccordionTrigger } from "../../ui/UIAccordion";
import { UIButton } from "../../ui/UIButton";
import { UITypography } from "../../ui/UITypography";
import { tileSizeSelector, useGameStore } from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorTool } from "../../../core/types/editor";

import { EditorGridPositionFields } from "./EditorGridPositionFields";
import { EditorSection } from "./EditorSection";
import { EditorEmptyState } from "./EditorEmptyState";

const PATH_SUB_TOOLS: Array<{ tool: LevelEditorTool; label: string }> = [
  { tool: "drawPath", label: "Draw" },
  { tool: "setSpawn", label: "Spawn" },
  { tool: "setBase", label: "Base" },
];

const getPathButtonKey = (pathIndex: number, pathLength: number) =>
  `path-button-${pathIndex}-${pathLength}`;

export const LevelEditorPathSection = () => {
  const tileSize = useGameStore(tileSizeSelector);
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
      ? draftLevel.pathWaypoints[selected.pathIndex]?.[selected.waypointIndex] ?? null
      : null;

  const selectedWaypointTile = useMemo(() => {
    if (!selectedWaypoint) return null;
    const gridOffset = -(draftLevel.gridSize * tileSize) / 2;
    return {
      gridX: Math.round((selectedWaypoint.x - gridOffset - tileSize / 2) / tileSize),
      gridZ: Math.round((selectedWaypoint.z - gridOffset - tileSize / 2) / tileSize),
    };
  }, [draftLevel.gridSize, selectedWaypoint, tileSize]);

  const isPathTool = activeTool === "drawPath" || activeTool === "setSpawn" || activeTool === "setBase";

  return (
    <UIAccordionItem value="path">
      <UIAccordionTrigger>Path</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          {PATH_SUB_TOOLS.map(({ tool, label }) => (
            <UIButton
              key={tool}
              size="xs"
              variant={activeTool === tool ? "default" : "outline"}
              onClick={() => setActiveTool(tool)}
              className={activeTool === tool ? "bg-violet-600 hover:bg-violet-700" : ""}
            >
              {label}
            </UIButton>
          ))}
        </div>

        <div className="flex gap-2">
          <UIButton size="sm" variant="outline" onClick={addPath}>
            <Plus />
            Add Path
          </UIButton>
          <UIButton size="sm" variant="destructive" onClick={removeSelectedPath}>
            <Trash2 />
            Remove
          </UIButton>
        </div>

        {draftLevel.pathWaypoints.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {draftLevel.pathWaypoints.map((path, pathIndex) => (
              <UIButton
                key={getPathButtonKey(pathIndex, path.length)}
                size="xs"
                variant={pathIndex === selectedPathIndex ? "default" : "outline"}
                onClick={() => selectPath(pathIndex)}
              >
                P{pathIndex + 1} ({path.length})
              </UIButton>
            ))}
          </div>
        ) : null}

        <EditorSection>
          <UITypography variant="medium">
            Path {selectedPathIndex + 1}
          </UITypography>
          <UITypography variant="verySmall" className="mt-1 text-muted-foreground">
            {isPathTool
              ? "Click tiles on the canvas to add waypoints."
              : "Switch to a path tool above to edit."}
          </UITypography>
          <UITypography variant="small" className="mt-2">
            Waypoints: {selectedPath.length}
          </UITypography>
        </EditorSection>

        {selectedWaypoint && selectedWaypointTile ? (
          <EditorSection className="flex flex-col gap-3">
            <UITypography variant="medium">Waypoint</UITypography>
            <EditorGridPositionFields
              gridX={selectedWaypointTile.gridX}
              gridZ={selectedWaypointTile.gridZ}
              onChangeGridX={(gridX) =>
                updateSelectedWaypoint({ gridX, gridZ: selectedWaypointTile.gridZ }, tileSize)
              }
              onChangeGridZ={(gridZ) =>
                updateSelectedWaypoint({ gridX: selectedWaypointTile.gridX, gridZ }, tileSize)
              }
            />
            <UIButton variant="destructive" size="sm" onClick={removeSelectedWaypoint}>
              <Trash2 />
              Remove Waypoint
            </UIButton>
          </EditorSection>
        ) : (
          <EditorEmptyState message="No waypoint selected." />
        )}
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
