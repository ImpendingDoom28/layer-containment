import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { UIAccordionContent, UIAccordionItem, UIAccordionTrigger } from "../../ui/UIAccordion";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import type { WaterVariant } from "../../../core/types/game";
import { getCssColorValue } from "../../ui/lib/cssUtils";

import { EditorSection } from "./EditorSection";

export type WaterVariantLabelKey =
  | "editor.water"
  | "editor.waterFootprints"
  | "editor.waterFootprintsHint"
  | "editor.waterVariantFull"
  | "editor.waterVariantHalfN"
  | "editor.waterVariantHalfE"
  | "editor.waterVariantHalfS"
  | "editor.waterVariantHalfW"
  | "editor.waterVariantCornerNW"
  | "editor.waterVariantCornerNE"
  | "editor.waterVariantCornerSE"
  | "editor.waterVariantCornerSW"
  | "editor.rotateWaterVariant";

const WATER_VARIANT_LABEL_KEYS: Record<WaterVariant, WaterVariantLabelKey> = {
  full: "editor.waterVariantFull",
  "half-n": "editor.waterVariantHalfN",
  "half-e": "editor.waterVariantHalfE",
  "half-s": "editor.waterVariantHalfS",
  "half-w": "editor.waterVariantHalfW",
  "corner-nw": "editor.waterVariantCornerNW",
  "corner-ne": "editor.waterVariantCornerNE",
  "corner-se": "editor.waterVariantCornerSE",
  "corner-sw": "editor.waterVariantCornerSW",
};

/**
 * The 3x3 compass palette for the water tool, mirroring the board: the nine
 * footprints (four corners, four edge halves, the full tile) as clickable
 * cells. Each cell previews its footprint with a small SVG (water over land);
 * clicking a cell selects that footprint, and R rotates it clockwise.
 */
// Footprint (water) as an SVG path in a 20x20 viewBox, water at the wet half.
const WATER_SHAPES: Record<WaterVariant, string> = {
  full: "M0 0 L20 0 L20 20 L0 20 Z",
  "half-n": "M0 0 L20 0 L20 10 L0 10 Z",
  "half-s": "M0 10 L20 10 L20 20 L0 20 Z",
  "half-e": "M10 0 L20 0 L20 20 L10 20 Z",
  "half-w": "M0 0 L10 0 L10 20 L0 20 Z",
  "corner-nw": "M0 0 L20 0 L0 20 Z",
  "corner-ne": "M0 0 L20 0 L20 20 Z",
  "corner-se": "M20 20 L0 20 L20 0 Z",
  "corner-sw": "M0 20 L0 0 L20 20 Z",
};

const LAND_FILL = getCssColorValue("scene-gray-700");
const WATER_FILL = getCssColorValue("scene-water");

const VariantCell = ({
  variant,
  label,
  isSelected,
  onSelect,
}: {
  variant: WaterVariant;
  label: string;
  isSelected: boolean;
  onSelect: () => void;
}) => {
  const shape = WATER_SHAPES[variant];
  return (
    <button
      type="button"
      title={label}
      aria-pressed={isSelected}
      onClick={onSelect}
      className={
        "h-11 w-11 rounded border bg-muted/40 p-1 transition-colors " +
        (isSelected
          ? "border-cyan-500 ring-2 ring-cyan-400/40"
          : "border-border hover:border-cyan-500/60")
      }
    >
      <svg viewBox="0 0 20 20" className="h-full w-full">
        <rect x="0" y="0" width="20" height="20" fill={LAND_FILL} />
        <path d={shape} fill={WATER_FILL} />
      </svg>
    </button>
  );
};

export const LevelEditorWaterSection = () => {
  const { t } = useTranslation();
  const waterVariant = useLevelEditorStore((state) => state.waterVariant);
  const setWaterVariant = useLevelEditorStore((state) => state.setWaterVariant);
  const rotateWaterVariant = useLevelEditorStore(
    (state) => state.rotateWaterVariant
  );

  // R rotates the selected footprint clockwise. The section only mounts in
  // water mode, so no further mode guard is needed; ignore repeats, other
  // keys, events from editable targets (typing "r" must not rotate), and
  // modifier combinations (Ctrl/Cmd+R reloads, Shift+R etc. are other
  // shortcuts).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== "KeyR" || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      rotateWaterVariant();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [rotateWaterVariant]);

  const cell = (variant: WaterVariant) => (
    <VariantCell
      variant={variant}
      label={t(WATER_VARIANT_LABEL_KEYS[variant])}
      isSelected={waterVariant === variant}
      onSelect={() => setWaterVariant(variant)}
    />
  );

  return (
    <UIAccordionItem value="water">
      <UIAccordionTrigger>{t("editor.water")}</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <EditorSection className="flex flex-col gap-3">
          <div>
            <p className="text-sm font-medium">{t("editor.waterFootprints")}</p>
            <p className="text-xs text-muted-foreground">
              {t("editor.waterFootprintsHint")}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {cell("corner-nw")}
            {cell("half-n")}
            {cell("corner-ne")}
            {cell("half-w")}
            {cell("full")}
            {cell("half-e")}
            {cell("corner-sw")}
            {cell("half-s")}
            {cell("corner-se")}
          </div>

          <button
            type="button"
            onClick={rotateWaterVariant}
            className="rounded border border-border px-3 py-1.5 text-sm hover:border-cyan-500/60"
            title="R"
          >
            {t("editor.rotateWaterVariant")}
          </button>
        </EditorSection>
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
