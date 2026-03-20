import { useMemo, useState } from "react";

import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

import { UIAccordionContent, UIAccordionItem, UIAccordionTrigger } from "../../ui/UIAccordion";
import { UIButton } from "../../ui/UIButton";
import { UIInput } from "../../ui/UIInput";
import { UISelect } from "../../ui/UISelect";
import { UITypography } from "../../ui/UITypography";
import { enemyTypesSelector, useGameStore } from "../../../core/stores/useGameStore";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { EnemyType } from "../../../core/types/game";

import { EditorField } from "./EditorField";
import { EditorSection } from "./EditorSection";
import { EditorEmptyState } from "./EditorEmptyState";

const FALLBACK_ENEMY_TYPES: EnemyType[] = ["basic", "fast", "tank"];

export const LevelEditorWaveSection = () => {
  const enemyTypes = useGameStore(enemyTypesSelector);
  const {
    draftLevel,
    addWave,
    removeWave,
    addWaveEnemyGroup,
    updateWaveEnemyGroup,
    removeWaveEnemyGroup,
  } = useLevelEditorStore();

  const [collapsedWaves, setCollapsedWaves] = useState<Set<number>>(new Set());

  const enemyTypeOptions = useMemo<EnemyType[]>(() => {
    if (!enemyTypes) return FALLBACK_ENEMY_TYPES;
    return Object.keys(enemyTypes) as EnemyType[];
  }, [enemyTypes]);

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
      <UIAccordionTrigger>Waves</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <UIButton size="sm" variant="outline" onClick={addWave}>
          <Plus />
          Add Wave
        </UIButton>

        {draftLevel.waveConfigs.length === 0 ? (
          <EditorEmptyState message="No waves configured yet." />
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
                  <UITypography variant="medium">Wave {waveIndex + 1}</UITypography>
                  <UITypography variant="verySmall" className="text-muted-foreground">
                    {wave.totalEnemies} enemies, {wave.enemies.length} groups
                  </UITypography>
                </button>
                <div className="flex gap-1.5">
                  <UIButton
                    size="icon-xs"
                    variant="outline"
                    onClick={() => addWaveEnemyGroup(waveIndex)}
                    title="Add enemy group"
                  >
                    <Plus />
                  </UIButton>
                  <UIButton
                    size="icon-xs"
                    variant="destructive"
                    onClick={() => removeWave(waveIndex)}
                    title="Remove wave"
                  >
                    <Trash2 />
                  </UIButton>
                </div>
              </div>

              {!isCollapsed ? (
                <div className="mt-3 flex flex-col gap-3">
                  {wave.enemies.length === 0 ? (
                    <EditorEmptyState message="No enemy groups. Add one above." />
                  ) : null}

                  {wave.enemies.map((enemyGroup, enemyGroupIndex) => (
                    <div
                      key={`wave-${waveIndex}-group-${enemyGroupIndex}`}
                      className="flex flex-col gap-2 border-l-2 border-muted-foreground/20 pl-3"
                    >
                      <div className="flex items-center justify-between">
                        <UITypography variant="verySmall" className="text-muted-foreground">
                          Group {enemyGroupIndex + 1}
                        </UITypography>
                        <UIButton
                          size="icon-xs"
                          variant="destructive"
                          onClick={() => removeWaveEnemyGroup(waveIndex, enemyGroupIndex)}
                        >
                          <Trash2 />
                        </UIButton>
                      </div>
                      <EditorField label="Type">
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
                              {enemyType}
                            </option>
                          ))}
                        </UISelect>
                      </EditorField>
                      <div className="grid grid-cols-2 gap-2">
                        <EditorField label="Count">
                          <UIInput
                            type="number"
                            min={0}
                            value={enemyGroup.count}
                            onChange={(event) =>
                              updateWaveEnemyGroup(waveIndex, enemyGroupIndex, {
                                count: Number(event.target.value) || 0,
                              })
                            }
                          />
                        </EditorField>
                        <EditorField label="Interval">
                          <UIInput
                            type="number"
                            step="0.1"
                            min={0.1}
                            value={enemyGroup.spawnInterval}
                            onChange={(event) =>
                              updateWaveEnemyGroup(waveIndex, enemyGroupIndex, {
                                spawnInterval: Number(event.target.value) || 0.1,
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
