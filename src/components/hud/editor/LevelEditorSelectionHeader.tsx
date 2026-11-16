import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { UITypography } from "../../ui/UITypography";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";

export const LevelEditorSelectionHeader = () => {
  const { t } = useTranslation();
  const { selected } = useLevelEditorStore();

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

  if (!selectionLabel) return null;

  return (
    <div className="flex items-center border-b border-border px-4 py-2">
      <UITypography variant="verySmall" className="text-muted-foreground">
        {selectionLabel}
      </UITypography>
    </div>
  );
};
