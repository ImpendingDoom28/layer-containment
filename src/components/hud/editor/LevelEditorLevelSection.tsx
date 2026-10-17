import { useTranslation } from "react-i18next";
import { useEnemyTypeOptions } from "../../../core/hooks/useEnemyTypeOptions";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import {
  parseFiniteNumberFromEvent,
  parseNumberInputOr,
} from "../../../utils/parseNumberInput";
import {
  MAX_GRID_SIZE,
  MIN_GRID_SIZE,
  clampGridSize,
} from "../../../utils/gridSizeLimits";
import {
  UIAccordionContent,
  UIAccordionItem,
  UIAccordionTrigger,
} from "../../ui/UIAccordion";
import { UIInput } from "../../ui/UIInput";

import { EditorColorField } from "./EditorColorField";
import { EditorField } from "./EditorField";

export const LevelEditorLevelSection = () => {
  const { t } = useTranslation();
  const tileSize = useGameStore(tileSizeSelector);
  const enemyTypeOptions = useEnemyTypeOptions();
  const {
    draftLevel,
    setLevelName,
    setStartingMoney,
    setGridSize,
    setEnemyWeight,
    setTileColor,
    setGroundColor,
  } = useLevelEditorStore();

  return (
    <UIAccordionItem value="level">
      <UIAccordionTrigger>{t("editor.level")}</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <EditorField
          label={t("editor.name")}
          description={t("editor.nameDescription")}
        >
          <UIInput
            value={draftLevel.name}
            onChange={(event) => setLevelName(event.target.value)}
            placeholder="custom"
          />
        </EditorField>

        <EditorField label={t("editor.startingMoney")}>
          <UIInput
            type="number"
            value={draftLevel.startingMoney}
            onChange={(event) => setStartingMoney(parseNumberInputOr(event, 0))}
          />
        </EditorField>

        <EditorField label={t("editor.gridSize")}>
          <UIInput
            type="number"
            min={MIN_GRID_SIZE}
            max={MAX_GRID_SIZE}
            value={draftLevel.gridSize}
            onChange={(event) =>
              setGridSize(
                clampGridSize(
                  parseFiniteNumberFromEvent(event, draftLevel.gridSize)
                ),
                tileSize
              )
            }
          />
        </EditorField>

        <div className="grid grid-cols-2 gap-2">
          <EditorField label={t("editor.tileColor")}>
            <EditorColorField
              value={draftLevel.tileColor}
              defaultToken="editor-default-tile"
              onChange={setTileColor}
            />
          </EditorField>
          <EditorField label={t("editor.groundColor")}>
            <EditorColorField
              value={draftLevel.groundColor}
              defaultToken="editor-default-ground"
              onChange={setGroundColor}
            />
          </EditorField>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {enemyTypeOptions.map((enemyType) => (
            <EditorField key={enemyType} label={t(`enemies.${enemyType}.name`)}>
              <UIInput
                type="number"
                min={0}
                value={draftLevel.enemyWeights?.[enemyType] ?? 0}
                onChange={(event) =>
                  setEnemyWeight(
                    enemyType,
                    parseFiniteNumberFromEvent(event, 0)
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
