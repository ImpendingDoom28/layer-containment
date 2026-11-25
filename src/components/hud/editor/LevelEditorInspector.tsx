import { useEffect, useRef, useState } from "react";

import { UIAccordion } from "../../ui/UIAccordion";
import { UICard, UICardContent } from "../../ui/UICard";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { LevelEditorMode, LevelEditorTool } from "../../../core/types/editor";
import { HUDWrapper } from "../HUDWrapper";

import { LevelEditorSelectionHeader } from "./LevelEditorSelectionHeader";
import { LevelEditorLevelSection } from "./LevelEditorLevelSection";
import { LevelEditorPathSection } from "./LevelEditorPathSection";
import { LevelEditorBuildingSection } from "./LevelEditorBuildingSection";
import { LevelEditorWaterSection } from "./LevelEditorWaterSection";
import { LevelEditorWaveSection } from "./LevelEditorWaveSection";
import { LevelEditorPublishSection } from "./LevelEditorPublishSection";

const TOOL_TO_MODE: Record<LevelEditorTool, LevelEditorMode> = {
  select: "select",
  placeBuilding: "building",
  drawPath: "path",
  setSpawn: "path",
  setBase: "path",
  erase: "erase",
  water: "water",
  canyon: "canyon",
};

export const LevelEditorInspector = () => {
  const activeTool = useLevelEditorStore((state) => state.activeTool);
  const selected = useLevelEditorStore((state) => state.selected);
  const activeMode = TOOL_TO_MODE[activeTool];

  const showPath =
    activeMode === "path" ||
    selected?.type === "path" ||
    selected?.type === "waypoint";

  const showBuilding = selected?.type === "building";
  const showWater = activeMode === "water";

  // Accordion open state. defaultValue is read only on mount, and the
  // inspector stays mounted across tool changes, so the state is controlled:
  // a section opens the first time its visibility flag turns on (the water
  // tool, a path/waypoint, or a building is selected) and a manual close is
  // preserved while the flag stays on.
  const defaultOpen = ["level", "waves", "publish"];
  if (showPath) defaultOpen.push("path");
  if (showBuilding) defaultOpen.push("building");
  if (showWater) defaultOpen.push("water");

  const [open, setOpen] = useState<string[]>(defaultOpen);
  // Each section opens when its visibility flag goes false -> true (a path is
  // selected, a building is selected, or the water tool is activated) — tracked
  // per section, so activating water still opens it even while a path or
  // waypoint stays selected. A section the user closed while its flag stays
  // true is not reopened; it reopens on the next false -> true transition.
  const prevShow = useRef({ path: showPath, building: showBuilding, water: showWater });
  useEffect(() => {
    const flags = { path: showPath, building: showBuilding, water: showWater };
    const toOpen = (Object.keys(flags) as ("path" | "building" | "water")[]).filter(
      (section) => !prevShow.current[section] && flags[section]
    );
    prevShow.current = flags;
    if (toOpen.length === 0) return;
    setOpen((prev) => [...prev, ...toOpen.filter((section) => !prev.includes(section))]);
  }, [showPath, showBuilding, showWater]);

  return (
    <HUDWrapper className="pointer-events-none">
      <div className="flex h-full w-full justify-end">
        {/* A fixed, full-height side panel: no menu tilt/slide machinery, so
            the card genuinely fills the viewport height and its content
            scrolls instead of overflowing. The left padding keeps the panel
            clear of the mode rail at narrow widths, where max-w-xl does not
            constrain it to a width narrow enough to avoid the rail. */}
        <div className="h-full w-full max-w-xl pointer-events-auto pl-[72px] md:pl-[76px]">
          <UICard className="h-full w-full py-0">
            <LevelEditorSelectionHeader />
            <UICardContent className="min-h-0 flex-1 overflow-y-auto">
              <UIAccordion
                type="multiple"
                value={open}
                onValueChange={setOpen}
              >
                <LevelEditorLevelSection />
                {showPath ? <LevelEditorPathSection /> : null}
                {showBuilding ? <LevelEditorBuildingSection /> : null}
                {showWater ? <LevelEditorWaterSection /> : null}
                <LevelEditorWaveSection />
                <LevelEditorPublishSection />
              </UIAccordion>
            </UICardContent>
          </UICard>
        </div>
      </div>
    </HUDWrapper>
  );
};
