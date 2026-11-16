import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { UITypography } from "../../ui/UITypography";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";

export const LevelEditorSelectionHeader = () => {
  const { t } = useTranslation();
  const { selected, hasUnsavedChanges } = useLevelEditorStore();

  const selectionLabel = useMemo(() => {
    if (!selected) return null;

    if (selected.type === "building")
      return t("editor.buildingSelection", { id: selected.id });
    if (selected.type === "waypoint") {
      return t("editor.waypointSelection", {
        waypoint: selected.waypointIndex + 1,
        path: selected.pathIndex + 1,
      });
    }
    return t("editor.pathSelection", { path: selected.pathIndex + 1 });
  }, [selected, t]);

  // The active tool is already highlighted in the top-left mode rail, so the
  // header only surfaces what is selected plus the unsaved-changes dot; when
  // neither applies it renders nothing.
  if (!selectionLabel && !hasUnsavedChanges) return null;

  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-2">
      {selectionLabel ? (
        <UITypography variant="verySmall" className="text-muted-foreground">
          {selectionLabel}
        </UITypography>
      ) : (
        <span />
      )}
      {hasUnsavedChanges ? (
        <span
          className="size-1.5 rounded-full bg-amber-400"
          title={t("editor.unsavedChanges")}
        />
      ) : null}
    </div>
  );
};
