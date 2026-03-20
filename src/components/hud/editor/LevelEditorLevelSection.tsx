import { useMemo } from "react";

import {
  UIAccordionContent,
  UIAccordionItem,
  UIAccordionTrigger,
} from "../../ui/UIAccordion";
import { UIInput } from "../../ui/UIInput";
import {
  enemyTypesSelector,
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import { getCssColorValue } from "../../ui/lib/cssUtils";
import type { EnemyType } from "../../../core/types/game";

import { EditorField } from "./EditorField";

const FALLBACK_ENEMY_TYPES: EnemyType[] = ["basic", "fast", "tank"];

export const LevelEditorLevelSection = () => {
  const tileSize = useGameStore(tileSizeSelector);
  const enemyTypes = useGameStore(enemyTypesSelector);
  const {
    draftLevel,
    setLevelName,
    setStartingMoney,
    setGridSize,
    setEnemyWeight,
    setTileColor,
    setGroundColor,
  } = useLevelEditorStore();

  const enemyTypeOptions = useMemo<EnemyType[]>(() => {
    if (!enemyTypes) return FALLBACK_ENEMY_TYPES;
    return Object.keys(enemyTypes) as EnemyType[];
  }, [enemyTypes]);

  return (
    <UIAccordionItem value="level">
      <UIAccordionTrigger>Level</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <EditorField label="Name" description="Used in the exported filename.">
          <UIInput
            value={draftLevel.name}
            onChange={(event) => setLevelName(event.target.value)}
            placeholder="custom"
          />
        </EditorField>

        <EditorField label="Starting Money">
          <UIInput
            type="number"
            value={draftLevel.startingMoney}
            onChange={(event) =>
              setStartingMoney(Number(event.target.value) || 0)
            }
          />
        </EditorField>

        <EditorField label="Grid Size">
          <UIInput
            type="number"
            min={5}
            value={draftLevel.gridSize}
            onChange={(event) =>
              setGridSize(
                Number(event.target.value) || draftLevel.gridSize,
                tileSize
              )
            }
          />
        </EditorField>

        <div className="grid grid-cols-2 gap-2">
          <EditorField label="Tile Color">
            <div className="flex gap-1.5">
              <input
                type="color"
                value={draftLevel.tileColor ?? getCssColorValue("editor-default-tile")}
                onChange={(event) => setTileColor(event.target.value)}
                className="h-8 w-8 shrink-0 cursor-pointer border border-input bg-transparent p-0.5"
              />
              <UIInput
                value={draftLevel.tileColor ?? getCssColorValue("editor-default-tile")}
                onChange={(event) => setTileColor(event.target.value)}
              />
            </div>
          </EditorField>
          <EditorField label="Ground Color">
            <div className="flex gap-1.5">
              <input
                type="color"
                value={draftLevel.groundColor ?? getCssColorValue("editor-default-ground")}
                onChange={(event) => setGroundColor(event.target.value)}
                className="h-8 w-8 shrink-0 cursor-pointer border border-input bg-transparent p-0.5"
              />
              <UIInput
                value={draftLevel.groundColor ?? getCssColorValue("editor-default-ground")}
                onChange={(event) => setGroundColor(event.target.value)}
              />
            </div>
          </EditorField>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {enemyTypeOptions.map((enemyType) => (
            <EditorField key={enemyType} label={`${enemyType}`}>
              <UIInput
                type="number"
                min={0}
                value={draftLevel.enemyWeights?.[enemyType] ?? 0}
                onChange={(event) =>
                  setEnemyWeight(
                    enemyType,
                    Number.isNaN(Number(event.target.value))
                      ? 0
                      : Number(event.target.value)
                  )
                }
              />
            </EditorField>
          ))}
        </div>
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
