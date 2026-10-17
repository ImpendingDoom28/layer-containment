import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { useEnemyTypeOptions } from "../../../core/hooks/useEnemyTypeOptions";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { EnemyType } from "../../../core/types/game";
import { parseNumberInputOr } from "../../../utils/parseNumberInput";
import { UIAccordionContent, UIAccordionItem, UIAccordionTrigger } from "../../ui/UIAccordion";
import { UIButton } from "../../ui/buttons/UIButton";
import { UIInput } from "../../ui/UIInput";
import { UISelect } from "../../ui/UISelect";
import { UITypography } from "../../ui/UITypography";

import { EditorField } from "./EditorField";
import { EditorSection } from "./EditorSection";
import { EditorEmptyState } from "./EditorEmptyState";

export const LevelEditorWaveSection = () => {
  const { t } = useTranslation();
  const enemyTypeOptions = useEnemyTypeOptions();
  const {
    draftLevel,
    addWave,
    removeWave,
    addWaveEnemyGroup,
    updateWaveEnemyGroup,
    removeWaveEnemyGroup,
  } = useLevelEditorStore();

  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(new Set());

  const onToggleWave = (waveIndex: number) => {
    setCollapsedWaves((prev) => {
      const next = new Set(prev);
      if (next.has(waveIndex)) {
        next.delete(waveIndex);
      } else {
        next.add(waveIndex);
      }
      return next;
    });
  };

  return (
    <UIAccordionItem value="waves">
      <UIAccordionTrigger>{t("editor.waves")}</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <UIButton size="sm" variant="outline" onClick={addWave}>
          <Plus />
          {t("editor.addWave")}
        </UIButton>

        {draftLevel.waveConfigs.length === 0 ? (
          <EditorEmptyState message={t("editor.noWaves")} />
        ) : null}

        {draftLevel.waveConfigs.map((wave, waveIndex) => {
          const isCollapsed = collapsedWaves.has(waveIndex);

          return (
            <EditorSection key={`wave-${waveIndex}`}>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-left"
                  onClick={() => onToggleWave(waveIndex)}
                >
                  {isCollapsed ? (
                    <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronUp className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  <UITypography variant="medium">
                    {t("editor.wave", { index: waveIndex + 1 })}
                  </UITypography>
                  <UITypography variant="verySmall" className="text-muted-foreground">
                    {t("editor.waveSummary", {
                      enemies: wave.totalEnemies,
                      groups: wave.enemies.length,
                    })}
                  </UITypography>
                </button>
                <div className="flex gap-1.5">
                  <UIButton
                    size="icon-xs"
                    variant="outline"
                    onClick={() => addWaveEnemyGroup(waveIndex)}
                    title={t("editor.addEnemyGroup")}
                  >
                    <Plus />
                  </UIButton>
                  <UIButton
                    size="icon-xs"
                    variant="destructive"
                    onClick={() => removeWave(waveIndex)}
                    title={t("editor.removeWave")}
                  >
                    <Trash2 />
                  </UIButton>
                </div>
              </div>

              {!isCollapsed ? (
                <div className="mt-3 flex flex-col gap-3">
                  {wave.enemies.length === 0 ? (
                    <EditorEmptyState message={t("editor.noEnemyGroups")} />
                  ) : null}

                  {wave.enemies.map((enemyGroup, enemyGroupIndex) => (
                    <div
                      key={`wave-${waveIndex}-group-${enemyGroupIndex}`}
                      className="flex flex-col gap-2 border-l-2 border-muted-foreground/20 pl-3"
                    >
                      <div className="flex items-center justify-between">
                        <UITypography variant="verySmall" className="text-muted-foreground">
                          {t("editor.group", { index: enemyGroupIndex + 1 })}
                        </UITypography>
                        <UIButton
                          size="icon-xs"
                          variant="destructive"
                          onClick={() => removeWaveEnemyGroup(waveIndex, enemyGroupIndex)}
                        >
                          <Trash2 />
                        </UIButton>
                      </div>
                      <EditorField label={t("editor.type")}>
                        <UISelect
                          value={enemyGroup.type}
                          onChange={(event) =>
                            updateWaveEnemyGroup(waveIndex, enemyGroupIndex, {
                              type: event.target.value as EnemyType,
                            })
                          }
                        >
                          {enemyTypeOptions.map((enemyType) => (
                            <option key={enemyType} value={enemyType}>
                              {t(`enemies.${enemyType}.name`)}
                            </option>
                          ))}
                        </UISelect>
                      </EditorField>
                      <div className="grid grid-cols-2 gap-2">
                        <EditorField label={t("editor.count")}>
                          <UIInput
                            type="number"
                            min={0}
                            value={enemyGroup.count}
                            onChange={(event) =>
                              updateWaveEnemyGroup(waveIndex, enemyGroupIndex, {
                                count: parseNumberInputOr(event, 0),
                              })
                            }
                          />
                        </EditorField>
                        <EditorField label={t("editor.interval")}>
                          <UIInput
                            type="number"
                            step="0.1"
                            min={0.1}
                            value={enemyGroup.spawnInterval}
                            onChange={(event) =>
                              updateWaveEnemyGroup(waveIndex, enemyGroupIndex, {
                                spawnInterval: parseNumberInputOr(event, 0.1),
                              })
                            }
                          />
                        </EditorField>
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </EditorSection>
          );
        })}
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
