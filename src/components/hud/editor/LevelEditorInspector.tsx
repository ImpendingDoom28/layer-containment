import { UIAccordion } from "../../ui/UIAccordion";
import { UICard, UICardContent } from "../../ui/UICard";
import { UITypography } from "../../ui/UITypography";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorMode, LevelEditorTool } from "../../../core/types/editor";
import { HUDSidePanel } from "../HUDSidePanel";

import { LevelEditorSelectionHeader } from "./LevelEditorSelectionHeader";
import { LevelEditorLevelSection } from "./LevelEditorLevelSection";
import { LevelEditorPathSection } from "./LevelEditorPathSection";
import { LevelEditorBuildingSection } from "./LevelEditorBuildingSection";
import { LevelEditorWaveSection } from "./LevelEditorWaveSection";
import { LevelEditorPublishSection } from "./LevelEditorPublishSection";

const TOOL_TO_MODE: Record<LevelEditorTool, LevelEditorMode> = {
  select: "select",
  placeBuilding: "building",
  drawPath: "path",
  setSpawn: "path",
  setBase: "path",
  erase: "erase",
};

export const LevelEditorInspector = () => {
  const { activeTool, selected, draftLevel } = useLevelEditorStore();
  const activeMode = TOOL_TO_MODE[activeTool];

  const showPath =
    activeMode === "path" ||
    selected?.type === "path" ||
    selected?.type === "waypoint";

  const showBuilding = selected?.type === "building";

  const defaultOpen = ["level", "waves", "publish"];
  if (showPath) defaultOpen.push("path");
  if (showBuilding) defaultOpen.push("building");

  return (
    <HUDSidePanel side="right" className="pointer-events-none">
      <UICard className="pointer-events-auto h-full w-full shadow-2xl">
        <LevelEditorSelectionHeader />

        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <UITypography variant="verySmall" className="text-muted-foreground">
            {`level_${draftLevel.name || "name"}.json`}
          </UITypography>
        </div>

        <UICardContent className="min-h-0 flex-1 overflow-y-auto pb-4">
          <UIAccordion type="multiple" defaultValue={defaultOpen}>
            <LevelEditorLevelSection />
            {showPath ? <LevelEditorPathSection /> : null}
            {showBuilding ? <LevelEditorBuildingSection /> : null}
            <LevelEditorWaveSection />
            <LevelEditorPublishSection />
          </UIAccordion>
        </UICardContent>
      </UICard>
    </HUDSidePanel>
  );
};
