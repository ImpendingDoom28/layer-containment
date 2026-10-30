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
import { UITextarea } from "../../ui/UITextarea";

import { EditorColorField } from "./EditorColorField";
import { EditorField } from "./EditorField";

export const LevelEditorLevelSection = () => {
  const { t } = useTranslation();
  const tileSize = useGameStore(tileSizeSelector);
  const enemyTypeOptions = useEnemyTypeOptions();
  const {
    draftLevel,
    setLevelName,
    setLabel,
    setDescription,
    setStartingHealth,
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
            placeholder={t("editor.namePlaceholder")}
          />
        </EditorField>

        <EditorField
          label={t("editor.label")}
          description={t("editor.labelDescription")}
          htmlFor="level-editor-label"
        >
          <UIInput
            id="level-editor-label"
            value={draftLevel.label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t("editor.labelPlaceholder")}
          />
        </EditorField>

        <EditorField
          label={t("editor.description")}
          description={t("editor.descriptionDescription")}
          htmlFor="level-editor-description"
        >
          <UITextarea
            id="level-editor-description"
            value={draftLevel.description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={t("editor.descriptionPlaceholder")}
            rows={2}
          />
        </EditorField>

        <div className="grid grid-cols-2 gap-2">
          <EditorField
            label={t("editor.startingHealth")}
            htmlFor="level-editor-starting-health"
          >
            <UIInput
              id="level-editor-starting-health"
              type="number"
              min={1}
              value={draftLevel.startingHealth}
              onChange={(event) =>
                setStartingHealth(parseNumberInputOr(event, 1))
              }
            />
          </EditorField>
          <EditorField label={t("editor.startingMoney")}>
            <UIInput
              type="number"
              value={draftLevel.startingMoney}
              onChange={(event) =>
                setStartingMoney(parseNumberInputOr(event, 0))
              }
            />
          </EditorField>
        </div>

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
