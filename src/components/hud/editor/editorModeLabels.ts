import type { LevelEditorMode } from "../../../core/types/editor";

export type EditorModeLabelKey =
  | "editor.modeSelect"
  | "editor.modePath"
  | "editor.modeBuilding"
  | "editor.modeWater"
  | "editor.modeCanyon"
  | "editor.modeErase";

export const EDITOR_MODE_LABEL_KEYS: Record<LevelEditorMode, EditorModeLabelKey> = {
  select: "editor.modeSelect",
  path: "editor.modePath",
  building: "editor.modeBuilding",
  water: "editor.modeWater",
  canyon: "editor.modeCanyon",
  erase: "editor.modeErase",
};
