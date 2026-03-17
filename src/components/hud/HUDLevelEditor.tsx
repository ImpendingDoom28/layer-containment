import {
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FC,
  type ReactNode,
} from "react";

import { ChevronLeft, Download, FileUp, Plus, Route, Trash2 } from "lucide-react";

import { UIButton } from "../ui/UIButton";
import {
  UICard,
  UICardContent,
  UICardDescription,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import {
  UIAccordion,
  UIAccordionContent,
  UIAccordionItem,
  UIAccordionTrigger,
} from "../ui/UIAccordion";
import { UIInput } from "../ui/UIInput";
import { UISelect } from "../ui/UISelect";
import { UITypography } from "../ui/UITypography";
import { HUDWrapper } from "./HUDWrapper";
import { HUDSidePanel } from "./HUDSidePanel";
import { enemyTypesSelector, tileSizeSelector, useGameStore } from "../../core/stores/useGameStore";
import { loadLevelConfigFile, parseLevelConfigData } from "../../core/levelConfig";
import { useLevelEditorStore } from "../../core/stores/useLevelEditorStore";
import type { EnemyType } from "../../core/types/game";
import { buildLevelFileName, createExportableLevel } from "../../utils/levelEditor";

type HUDLevelEditorProps = {
  onBackToGame: () => void;
};

type HUDFieldProps = {
  label: string;
  children: ReactNode;
  description?: string;
};

const HUDToolButton: FC<{
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ label, isActive, onClick }) => {
  return (
    <UIButton
      variant={isActive ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="justify-start"
    >
      {label}
    </UIButton>
  );
};

const HUDField: FC<HUDFieldProps> = ({ label, description, children }) => {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <UITypography variant="medium">{label}</UITypography>
        {description ? (
          <UITypography variant="verySmall" className="text-muted-foreground">
            {description}
          </UITypography>
        ) : null}
      </div>
      {children}
    </div>
  );
};

const FALLBACK_ENEMY_TYPES: EnemyType[] = ["basic", "fast", "tank"];

const getPathButtonKey = (pathIndex: number, pathLength: number) => {
  return `path-button-${pathIndex}-${pathLength}`;
};

export const HUDLevelEditor: FC<HUDLevelEditorProps> = ({ onBackToGame }) => {
  const tileSize = useGameStore(tileSizeSelector);
  const enemyTypes = useGameStore(enemyTypesSelector);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const {
    draftLevel,
    activeTool,
    selected,
    selectedPathIndex,
    validationIssues,
    hasUnsavedChanges,
    resetDraftLevel,
    loadDraftLevel,
    setActiveTool,
    setLevelName,
    setStartingMoney,
    setGridSize,
    setEnemyWeight,
    addPath,
    selectPath,
    removeSelectedPath,
    updateSelectedBuilding,
    removeSelectedBuilding,
    updateSelectedWaypoint,
    removeSelectedWaypoint,
    addWave,
    removeWave,
    addWaveEnemyGroup,
    updateWaveEnemyGroup,
    removeWaveEnemyGroup,
    validateDraftLevel,
  } = useLevelEditorStore();

  const enemyTypeOptions = useMemo<EnemyType[]>(() => {
    if (!enemyTypes) {
      return FALLBACK_ENEMY_TYPES;
    }

    return Object.keys(enemyTypes) as EnemyType[];
  }, [enemyTypes]);

  const selectedBuilding =
    selected?.type === "building"
      ? draftLevel.buildings.find((building) => building.id === selected.id) ?? null
      : null;

  const selectedWaypoint =
    selected?.type === "waypoint"
      ? draftLevel.pathWaypoints[selected.pathIndex]?.[selected.waypointIndex] ?? null
      : null;

  const selectedObjectLabel = useMemo(() => {
    if (!selected) {
      return "None";
    }

    if (selected.type === "building") {
      return `Building #${selected.id}`;
    }

    if (selected.type === "waypoint") {
      return `Waypoint ${selected.waypointIndex + 1} on path ${
        selected.pathIndex + 1
      }`;
    }

    return `Path ${selected.pathIndex + 1}`;
  }, [selected]);

  const selectedPath = draftLevel.pathWaypoints[selectedPathIndex] ?? [];

  const selectedWaypointTile = useMemo(() => {
    if (!selectedWaypoint) {
      return null;
    }

    const gridOffset = -(draftLevel.gridSize * tileSize) / 2;
    return {
      gridX: Math.round((selectedWaypoint.x - gridOffset - tileSize / 2) / tileSize),
      gridZ: Math.round((selectedWaypoint.z - gridOffset - tileSize / 2) / tileSize),
    };
  }, [draftLevel.gridSize, selectedWaypoint, tileSize]);

  const onLoadSample = async () => {
    try {
      const sampleLevel = await loadLevelConfigFile("level_1");
      loadDraftLevel(sampleLevel, tileSize);
      setStatusMessage("Loaded sample level.");
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to load sample level."
      );
    }
  };

  const onImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const fileContents = await file.text();
      const parsedJson = JSON.parse(fileContents) as unknown;
      const parsedLevel = parseLevelConfigData(parsedJson);

      if (!parsedLevel.success) {
        setStatusMessage(parsedLevel.error.issues[0]?.message ?? "Invalid level JSON.");
        return;
      }

      loadDraftLevel(parsedLevel.data, tileSize);
      setStatusMessage(`Imported ${file.name}.`);
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : "Failed to import level JSON."
      );
    } finally {
      event.target.value = "";
    }
  };

  const onValidate = () => {
    const isValid = validateDraftLevel();
    setStatusMessage(isValid ? "Level is valid." : "Fix validation issues before exporting.");
  };

  const onDownloadJson = () => {
    const isValid = validateDraftLevel();
    if (!isValid) {
      setStatusMessage("Fix validation issues before exporting.");
      return;
    }

    const exportableLevel = createExportableLevel(draftLevel, tileSize);
    const parsedLevel = parseLevelConfigData(exportableLevel);
    if (!parsedLevel.success) {
      setStatusMessage(parsedLevel.error.issues[0]?.message ?? "Level export failed.");
      return;
    }

    const blob = new Blob([JSON.stringify(parsedLevel.data, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = buildLevelFileName(draftLevel.name);
    link.click();
    URL.revokeObjectURL(objectUrl);
    setStatusMessage(`Downloaded ${buildLevelFileName(draftLevel.name)}.`);
  };

  return (
    <>
      <HUDWrapper className="pointer-events-none">
        <div className="pointer-events-auto p-4 md:p-6">
        <UICard className="w-full max-w-xs shadow-2xl">
          <UICardHeader>
            <UICardTitle className="justify-between">
              <UITypography variant="subHeadline">Editor Tools</UITypography>
              <UIButton variant="outline" size="sm" onClick={onBackToGame}>
                <ChevronLeft />
                Back
              </UIButton>
            </UICardTitle>
            <UICardDescription>
              Build paths, place objects, and prepare level data for export.
            </UICardDescription>
          </UICardHeader>
          <UICardContent className="gap-4">
            <div className="grid grid-cols-2 gap-2">
              <HUDToolButton
                label="Select"
                isActive={activeTool === "select"}
                onClick={() => setActiveTool("select")}
              />
              <HUDToolButton
                label="Building"
                isActive={activeTool === "placeBuilding"}
                onClick={() => setActiveTool("placeBuilding")}
              />
              <HUDToolButton
                label="Draw Path"
                isActive={activeTool === "drawPath"}
                onClick={() => setActiveTool("drawPath")}
              />
              <HUDToolButton
                label="Spawn"
                isActive={activeTool === "setSpawn"}
                onClick={() => setActiveTool("setSpawn")}
              />
              <HUDToolButton
                label="Base"
                isActive={activeTool === "setBase"}
                onClick={() => setActiveTool("setBase")}
              />
              <HUDToolButton
                label="Erase"
                isActive={activeTool === "erase"}
                onClick={() => setActiveTool("erase")}
              />
            </div>

            <div className="flex flex-col gap-2">
              <UIButton onClick={resetDraftLevel} variant="outline" size="sm">
                New Blank
              </UIButton>
              <UIButton onClick={onLoadSample} variant="outline" size="sm">
                <Route />
                Load Sample
              </UIButton>
              <UIButton
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                size="sm"
              >
                <FileUp />
                Import JSON
              </UIButton>
              <UIButton onClick={onValidate} variant="outline" size="sm">
                Validate
              </UIButton>
              <UIButton onClick={onDownloadJson} size="sm">
                <Download />
                Download JSON
              </UIButton>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={onImportJson}
              />
            </div>

            <div className="border p-3">
              <UITypography variant="medium">Status</UITypography>
              <UITypography
                variant="small"
                className="mt-1 text-muted-foreground"
              >
                {statusMessage ??
                  (hasUnsavedChanges ? "Draft has unsaved changes." : "Draft is up to date.")}
              </UITypography>
            </div>
          </UICardContent>
        </UICard>
        </div>
      </HUDWrapper>

      <HUDSidePanel side="right" className="pointer-events-none">
        <UICard className="pointer-events-auto h-full w-full shadow-2xl">
          <UICardHeader>
            <UICardTitle className="justify-between">
              <UITypography variant="h4">HUD Level Editor</UITypography>
              <UITypography variant="verySmall" className="text-muted-foreground">
                {`Export: level_${draftLevel.name || "name"}.json`}
              </UITypography>
            </UICardTitle>
            <UICardDescription>
              Route, objects, waves, and schema-backed level settings.
            </UICardDescription>
          </UICardHeader>

          <UICardContent className="min-h-0 flex-1 overflow-y-auto pb-4">
            <UIAccordion type="multiple" defaultValue={["level", "paths", "waves"]}>
              <UIAccordionItem value="level">
                <UIAccordionTrigger>Level</UIAccordionTrigger>
                <UIAccordionContent className="flex flex-col gap-3">
                  <HUDField
                    label="Level Name"
                    description="Saved to JSON and used in the exported filename."
                  >
                    <UIInput
                      value={draftLevel.name}
                      onChange={(event) => setLevelName(event.target.value)}
                      placeholder="custom"
                    />
                  </HUDField>

                  <HUDField label="Starting Money">
                    <UIInput
                      type="number"
                      value={draftLevel.startingMoney}
                      onChange={(event) =>
                        setStartingMoney(Number(event.target.value) || 0)
                      }
                    />
                  </HUDField>

                  <HUDField label="Grid Size">
                    <UIInput
                      type="number"
                      min={5}
                      value={draftLevel.gridSize}
                      onChange={(event) =>
                        setGridSize(Number(event.target.value) || draftLevel.gridSize, tileSize)
                      }
                    />
                  </HUDField>

                  <div className="grid grid-cols-3 gap-2">
                    {enemyTypeOptions.map((enemyType) => (
                      <HUDField key={enemyType} label={`${enemyType} Weight`}>
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
                      </HUDField>
                    ))}
                  </div>
                </UIAccordionContent>
              </UIAccordionItem>

              <UIAccordionItem value="paths">
                <UIAccordionTrigger>Paths</UIAccordionTrigger>
                <UIAccordionContent className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <UIButton size="sm" variant="outline" onClick={addPath}>
                      <Plus />
                      Add Path
                    </UIButton>
                    <UIButton
                      size="sm"
                      variant="destructive"
                      onClick={removeSelectedPath}
                    >
                      <Trash2 />
                      Remove Selected
                    </UIButton>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {draftLevel.pathWaypoints.map((path, pathIndex) => (
                      <UIButton
                        key={getPathButtonKey(pathIndex, path.length)}
                        size="sm"
                        variant={pathIndex === selectedPathIndex ? "default" : "outline"}
                        onClick={() => selectPath(pathIndex)}
                      >
                        Path {pathIndex + 1} ({path.length})
                      </UIButton>
                    ))}
                  </div>

                  <div className="border p-3">
                    <UITypography variant="medium">Selected Path</UITypography>
                    <UITypography
                      variant="small"
                      className="mt-1 text-muted-foreground"
                    >
                      Use `Draw Path`, `Spawn`, and `Base` tools in the scene to edit waypoints.
                    </UITypography>
                    <UITypography variant="small" className="mt-2">
                      Waypoints: {selectedPath.length}
                    </UITypography>
                  </div>

                  {selectedWaypoint && selectedWaypointTile ? (
                    <div className="border p-3">
                      <UITypography variant="medium">Selected Waypoint</UITypography>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <HUDField label="Grid X">
                          <UIInput
                            type="number"
                            value={selectedWaypointTile.gridX}
                            onChange={(event) =>
                              updateSelectedWaypoint(
                                {
                                  gridX: Number(event.target.value) || 0,
                                  gridZ: selectedWaypointTile.gridZ,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                        <HUDField label="Grid Z">
                          <UIInput
                            type="number"
                            value={selectedWaypointTile.gridZ}
                            onChange={(event) =>
                              updateSelectedWaypoint(
                                {
                                  gridX: selectedWaypointTile.gridX,
                                  gridZ: Number(event.target.value) || 0,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                      </div>
                      <UIButton
                        variant="destructive"
                        size="sm"
                        className="mt-3"
                        onClick={removeSelectedWaypoint}
                      >
                        <Trash2 />
                        Remove Waypoint
                      </UIButton>
                    </div>
                  ) : null}
                </UIAccordionContent>
              </UIAccordionItem>

              <UIAccordionItem value="buildings">
                <UIAccordionTrigger>Buildings</UIAccordionTrigger>
                <UIAccordionContent className="flex flex-col gap-3">
                  <UITypography variant="small" className="text-muted-foreground">
                    Select a placed building in the scene to edit its properties.
                  </UITypography>

                  {selectedBuilding ? (
                    <div className="flex flex-col gap-3 border p-3">
                      <div className="grid grid-cols-2 gap-2">
                        <HUDField label="Grid X">
                          <UIInput
                            type="number"
                            value={selectedBuilding.gridX}
                            onChange={(event) =>
                              updateSelectedBuilding(
                                {
                                  gridX: Number(event.target.value) || 0,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                        <HUDField label="Grid Z">
                          <UIInput
                            type="number"
                            value={selectedBuilding.gridZ}
                            onChange={(event) =>
                              updateSelectedBuilding(
                                {
                                  gridZ: Number(event.target.value) || 0,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                      </div>

                      <HUDField label="Shape">
                        <UISelect
                          value={selectedBuilding.shape}
                          onChange={(event) =>
                            updateSelectedBuilding(
                              {
                                shape: event.target.value as "box" | "cylinder",
                              },
                              tileSize
                            )
                          }
                        >
                          <option value="box">Box</option>
                          <option value="cylinder">Cylinder</option>
                        </UISelect>
                      </HUDField>

                      <div className="grid grid-cols-3 gap-2">
                        <HUDField label="Width">
                          <UIInput
                            type="number"
                            step="0.1"
                            value={selectedBuilding.width}
                            onChange={(event) =>
                              updateSelectedBuilding(
                                {
                                  width: Number(event.target.value) || 0.1,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                        <HUDField label="Depth">
                          <UIInput
                            type="number"
                            step="0.1"
                            value={selectedBuilding.depth}
                            onChange={(event) =>
                              updateSelectedBuilding(
                                {
                                  depth: Number(event.target.value) || 0.1,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                        <HUDField label="Height">
                          <UIInput
                            type="number"
                            step="0.1"
                            value={selectedBuilding.height}
                            onChange={(event) =>
                              updateSelectedBuilding(
                                {
                                  height: Number(event.target.value) || 0.1,
                                },
                                tileSize
                              )
                            }
                          />
                        </HUDField>
                      </div>

                      <HUDField label="Color">
                        <UIInput
                          value={selectedBuilding.color}
                          onChange={(event) =>
                            updateSelectedBuilding(
                              {
                                color: event.target.value,
                              },
                              tileSize
                            )
                          }
                        />
                      </HUDField>

                      <UIButton
                        variant="destructive"
                        size="sm"
                        onClick={removeSelectedBuilding}
                      >
                        <Trash2 />
                        Remove Building
                      </UIButton>
                    </div>
                  ) : (
                    <UITypography variant="small" className="text-muted-foreground">
                      No building selected.
                    </UITypography>
                  )}
                </UIAccordionContent>
              </UIAccordionItem>

              <UIAccordionItem value="waves">
                <UIAccordionTrigger>Waves</UIAccordionTrigger>
                <UIAccordionContent className="flex flex-col gap-3">
                  <UIButton size="sm" variant="outline" onClick={addWave}>
                    <Plus />
                    Add Wave
                  </UIButton>

                  {draftLevel.waveConfigs.map((wave, waveIndex) => (
                    <div
                      key={`wave-${wave.totalEnemies}-${wave.enemies
                        .map((enemyGroup) => `${enemyGroup.type}:${enemyGroup.count}`)
                        .join("|")}`}
                      className="border p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <UITypography variant="medium">
                            Wave {waveIndex + 1}
                          </UITypography>
                          <UITypography
                            variant="verySmall"
                            className="text-muted-foreground"
                          >
                            Total enemies: {wave.totalEnemies}
                          </UITypography>
                        </div>
                        <div className="flex gap-2">
                          <UIButton
                            size="sm"
                            variant="outline"
                            onClick={() => addWaveEnemyGroup(waveIndex)}
                          >
                            <Plus />
                            Enemy
                          </UIButton>
                          <UIButton
                            size="sm"
                            variant="destructive"
                            onClick={() => removeWave(waveIndex)}
                          >
                            <Trash2 />
                          </UIButton>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-3">
                        {wave.enemies.map((enemyGroup, enemyGroupIndex) => (
                          <div
                            key={`wave-${waveIndex}-group-${enemyGroupIndex}`}
                            className="grid grid-cols-[1.3fr_1fr_1fr_auto] gap-2"
                          >
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
                            <UIButton
                              size="icon-sm"
                              variant="destructive"
                              onClick={() =>
                                removeWaveEnemyGroup(waveIndex, enemyGroupIndex)
                              }
                            >
                              <Trash2 />
                            </UIButton>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </UIAccordionContent>
              </UIAccordionItem>

              <UIAccordionItem value="validation">
                <UIAccordionTrigger>Validation</UIAccordionTrigger>
                <UIAccordionContent className="flex flex-col gap-2">
                  {validationIssues.length === 0 ? (
                    <UITypography variant="small" className="text-muted-foreground">
                      No validation issues yet. Run Validate to confirm export readiness.
                    </UITypography>
                  ) : (
                    validationIssues.map((issue, index) => (
                      <div
                        key={`issue-${issue.path}-${issue.message}-${index}`}
                        className="border p-3"
                      >
                        <UITypography variant="medium">{issue.path || "level"}</UITypography>
                        <UITypography
                          variant="small"
                          className="mt-1 text-muted-foreground"
                        >
                          {issue.message}
                        </UITypography>
                      </div>
                    ))
                  )}
                </UIAccordionContent>
              </UIAccordionItem>

              <UIAccordionItem value="selection">
                <UIAccordionTrigger>Selection</UIAccordionTrigger>
                <UIAccordionContent className="flex flex-col gap-2">
                  <UITypography variant="small" className="text-muted-foreground">
                    Current tool: {activeTool}
                  </UITypography>
                  <UITypography variant="small" className="text-muted-foreground">
                    Selected path: {selectedPathIndex + 1}
                  </UITypography>
                  <UITypography variant="small" className="text-muted-foreground">
                    Selected object: {selectedObjectLabel}
                  </UITypography>
                  <UITypography variant="small" className="text-muted-foreground">
                    Buildings: {draftLevel.buildings.length}
                  </UITypography>
                  <UITypography variant="small" className="text-muted-foreground">
                    Paths: {draftLevel.pathWaypoints.length}
                  </UITypography>
                  <UITypography variant="small" className="text-muted-foreground">
                    Waves: {draftLevel.waveConfigs.length}
                  </UITypography>
                </UIAccordionContent>
              </UIAccordionItem>
            </UIAccordion>
          </UICardContent>
        </UICard>
      </HUDSidePanel>
    </>
  );
};
