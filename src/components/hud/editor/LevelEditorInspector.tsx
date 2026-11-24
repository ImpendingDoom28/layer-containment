import { useEffect, useState } from "react";

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
  // inspector stays mounted across tool changes, so the state is controlled
  // and the active mode's section is (re)opened whenever the mode or
  // selection changes; sections the user closed stay closed until then.
  const defaultOpen = ["level", "waves", "publish"];
  if (showPath) defaultOpen.push("path");
  if (showBuilding) defaultOpen.push("building");
  if (showWater) defaultOpen.push("water");

  const [open, setOpen] = useState<string[]>(defaultOpen);
  const modeSection = showPath
    ? "path"
    : showBuilding
      ? "building"
      : showWater
        ? "water"
        : null;
  useEffect(() => {
    if (!modeSection) return;
    setOpen((prev) => (prev.includes(modeSection) ? prev : [...prev, modeSection]));
  }, [modeSection]);

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
