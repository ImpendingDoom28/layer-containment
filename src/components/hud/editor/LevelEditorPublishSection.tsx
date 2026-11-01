import { useRef, useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import { Icon, type IconColor, type IconName } from "@/components/ui/Icon";
import {
  UIAccordionContent,
  UIAccordionItem,
  UIAccordionTrigger,
} from "../../ui/UIAccordion";
import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "@/components/ui/UITypography";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import {
  loadLevelConfigFile,
  parseLevelConfigData,
} from "../../../core/configs/levelConfig";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import {
  buildLevelFileName,
  createExportableLevel,
} from "../../../utils/levelEditor";
import type { LevelEditorPublishState } from "../../../core/types/editor";

import { EditorSection } from "./EditorSection";

const getPublishState = (
  validationIssues: Array<{ path: string; message: string }>,
  hasUnsavedChanges: boolean
): LevelEditorPublishState => {
  if (validationIssues.length > 0) return "needsFixes";
  if (hasUnsavedChanges) return "drafting";
  return "ready";
};

const PUBLISH_CONFIG: Record<
  LevelEditorPublishState,
  { label: "editor.drafting" | "editor.needsFixes" | "editor.readyToExport"; className: string; icon: IconName; iconColor: IconColor }
> = {
  drafting: {
    label: "editor.drafting",
    className: "text-muted-foreground",
    icon: "Pencil",
    iconColor: "muted",
  },
  needsFixes: {
    label: "editor.needsFixes",
    className: "text-amber-400",
    icon: "AlertCircle",
    iconColor: "amber",
  },
  ready: {
    label: "editor.readyToExport",
    className: "text-emerald-400",
    icon: "CheckCircle2",
    iconColor: "emerald",
  },
};

const VISIBLE_ISSUES = 3;

export const LevelEditorPublishSection = () => {
  const { t } = useTranslation();
  const tileSize = useGameStore(tileSizeSelector);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [showAllIssues, setShowAllIssues] = useState(false);

  const {
    draftLevel,
    validationIssues,
    hasUnsavedChanges,
    resetDraftLevel,
    loadDraftLevel,
    validateDraftLevel,
  } = useLevelEditorStore();

  const publishState = getPublishState(validationIssues, hasUnsavedChanges);
  const config = PUBLISH_CONFIG[publishState];

  const visibleIssues = showAllIssues
    ? validationIssues
    : validationIssues.slice(0, VISIBLE_ISSUES);
  const hiddenCount = validationIssues.length - VISIBLE_ISSUES;

  const onLoadSample = async () => {
    try {
      const sampleLevel = await loadLevelConfigFile("level_1");
      loadDraftLevel(sampleLevel, tileSize);
      setStatusMessage(t("editor.loadedSample"));
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : t("editor.failedToLoadSample")
      );
    }
  };

  const onImportJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContents = await file.text();
      const parsedJson = JSON.parse(fileContents) as unknown;
      const parsedLevel = parseLevelConfigData(parsedJson);

      if (!parsedLevel.success) {
        setStatusMessage(
          parsedLevel.error.issues[0]?.message ?? t("editor.invalidLevelJson")
        );
        return;
      }

      loadDraftLevel(parsedLevel.data, tileSize);
      setStatusMessage(t("editor.imported", { name: file.name }));
    } catch (error) {
      setStatusMessage(
        error instanceof Error ? error.message : t("editor.failedToImport")
      );
    } finally {
      event.target.value = "";
    }
  };

  const onDownloadJson = () => {
    const isValid = validateDraftLevel(tileSize);
    if (!isValid) {
      setStatusMessage(t("editor.fixValidationIssues"));
      return;
    }

    const exportableLevel = createExportableLevel(draftLevel, tileSize);
    const parsedLevel = parseLevelConfigData(exportableLevel);
    if (!parsedLevel.success) {
      setStatusMessage(
        parsedLevel.error.issues[0]?.message ?? t("editor.levelExportFailed")
      );
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
    setStatusMessage(
      t("editor.downloaded", { name: buildLevelFileName(draftLevel.name) })
    );
  };

  const onValidate = () => {
    const isValid = validateDraftLevel(tileSize);
    setStatusMessage(
      isValid ? t("editor.levelIsValid") : t("editor.fixValidationIssues")
    );
  };

  return (
    <UIAccordionItem value="publish">
      <UIAccordionTrigger>{t("editor.publish")}</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <EditorSection className="flex items-center gap-2">
          <Icon name={config.icon} color={config.iconColor} size={16} className="shrink-0" />
          <UITypography variant="medium" className={config.className}>
            {t(config.label)}
          </UITypography>
        </EditorSection>

        {validationIssues.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {visibleIssues.map((issue, index) => (
              <div
                key={`issue-${issue.path}-${index}`}
                className="flex items-start gap-2 pl-2 border-l-2 border-amber-400/40"
              >
                <div>
                  <UITypography variant="verySmall" className="font-medium">
                    {issue.path || "level"}
                  </UITypography>
                  <UITypography
                    variant="verySmall"
                    className="text-muted-foreground"
                  >
                    {issue.message}
                  </UITypography>
                </div>
              </div>
            ))}
            {hiddenCount > 0 ? (
              <UIButton
                variant="ghost"
                size="xs"
                onClick={() => setShowAllIssues(!showAllIssues)}
              >
                {showAllIssues
                  ? t("editor.showLess")
                  : t("editor.showMore", { count: hiddenCount })}
              </UIButton>
            ) : null}
          </div>
        ) : null}

        {statusMessage ? (
          <UITypography variant="verySmall" className="text-muted-foreground">
            {statusMessage}
          </UITypography>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <UIButton onClick={onValidate} variant="outline" size="sm">
            {t("editor.validate")}
          </UIButton>
          <UIButton onClick={onDownloadJson} size="sm">
            <Icon name="Download" size={14} />
            {t("editor.exportJson")}
          </UIButton>
        </div>

        <div className="flex gap-1.5">
          <UIButton onClick={resetDraftLevel} variant="outline" size="xs">
            {t("editor.new")}
          </UIButton>
          <UIButton onClick={onLoadSample} variant="outline" size="xs">
            <Icon name="Route" size={12} />
            {t("editor.sample")}
          </UIButton>
          <UIButton
            onClick={() => fileInputRef.current?.click()}
            variant="outline"
            size="xs"
          >
            <Icon name="FileUp" size={12} />
            {t("editor.import")}
          </UIButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={onImportJson}
          />
        </div>
      </UIAccordionContent>
    </UIAccordionItem>
  );
};
