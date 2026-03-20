import { Trash2 } from "lucide-react";

import { UIAccordionContent, UIAccordionItem, UIAccordionTrigger } from "../../ui/UIAccordion";
import { UIButton } from "../../ui/UIButton";
import { UIInput } from "../../ui/UIInput";
import { UISelect } from "../../ui/UISelect";
import { tileSizeSelector, useGameStore } from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";

import { EditorField } from "./EditorField";
import { EditorGridPositionFields } from "./EditorGridPositionFields";
import { EditorSection } from "./EditorSection";
import { EditorEmptyState } from "./EditorEmptyState";

export const LevelEditorBuildingSection = () => {
  const tileSize = useGameStore(tileSizeSelector);
  const { draftLevel, selected, updateSelectedBuilding, removeSelectedBuilding } =
    useLevelEditorStore();

  const selectedBuilding =
    selected?.type === "building"
      ? draftLevel.buildings.find((b) => b.id === selected.id) ?? null
      : null;

  return (
    <UIAccordionItem value="building">
      <UIAccordionTrigger>Building</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        {selectedBuilding ? (
          <EditorSection className="flex flex-col gap-3">
            <EditorGridPositionFields
              gridX={selectedBuilding.gridX}
              gridZ={selectedBuilding.gridZ}
              onChangeGridX={(gridX) => updateSelectedBuilding({ gridX }, tileSize)}
              onChangeGridZ={(gridZ) => updateSelectedBuilding({ gridZ }, tileSize)}
            />

            <EditorField label="Shape">
              <UISelect
                value={selectedBuilding.shape}
                onChange={(event) =>
                  updateSelectedBuilding(
                    { shape: event.target.value as "box" | "cylinder" },
                    tileSize
                  )
                }
              >
                <option value="box">Box</option>
                <option value="cylinder">Cylinder</option>
              </UISelect>
            </EditorField>

            <div className="grid grid-cols-3 gap-2">
              <EditorField label="Width">
                <UIInput
                  type="number"
                  step="0.1"
                  value={selectedBuilding.width}
                  onChange={(event) =>
                    updateSelectedBuilding({ width: Number(event.target.value) || 0.1 }, tileSize)
                  }
                />
              </EditorField>
              <EditorField label="Depth">
                <UIInput
                  type="number"
                  step="0.1"
                  value={selectedBuilding.depth}
                  onChange={(event) =>
                    updateSelectedBuilding({ depth: Number(event.target.value) || 0.1 }, tileSize)
                  }
                />
              </EditorField>
              <EditorField label="Height">
                <UIInput
                  type="number"
                  step="0.1"
                  value={selectedBuilding.height}
                  onChange={(event) =>
                    updateSelectedBuilding({ height: Number(event.target.value) || 0.1 }, tileSize)
                  }
                />
              </EditorField>
            </div>

            <EditorField label="Color">
              <UIInput
                value={selectedBuilding.color}
                onChange={(event) =>
                  updateSelectedBuilding({ color: event.target.value }, tileSize)
                }
              />
            </EditorField>

            <UIButton variant="destructive" size="sm" onClick={removeSelectedBuilding}>
              <Trash2 />
              Remove Building
            </UIButton>
          </EditorSection>
        ) : (
          <EditorEmptyState message="Select a building in the scene to edit." />
        )}
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
