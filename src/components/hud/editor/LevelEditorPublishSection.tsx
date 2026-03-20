import { useRef, useState, type ChangeEvent } from "react";

import { AlertCircle, CheckCircle2, Download, FileUp, Pencil, Route } from "lucide-react";

import { UIAccordionContent, UIAccordionItem, UIAccordionTrigger } from "../../ui/UIAccordion";
import { UIButton } from "../../ui/UIButton";
import { UITypography } from "../../ui/UITypography";
import { tileSizeSelector, useGameStore } from "../../../core/stores/useGameStore";
import { loadLevelConfigFile, parseLevelConfigData } from "../../../core/levelConfig";
import { useLevelEditorStore } from "../../../core/stores/useLevelEditorStore";
import { buildLevelFileName, createExportableLevel } from "../../../utils/levelEditor";
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
  { label: string; className: string; icon: typeof Pencil }
> = {
  drafting: { label: "Drafting", className: "text-muted-foreground", icon: Pencil },
  needsFixes: { label: "Needs fixes", className: "text-amber-400", icon: AlertCircle },
  ready: { label: "Ready to export", className: "text-emerald-400", icon: CheckCircle2 },
};

const VISIBLE_ISSUES = 3;

export const LevelEditorPublishSection = () => {
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
  const StatusIcon = config.icon;

  const visibleIssues = showAllIssues
    ? validationIssues
    : validationIssues.slice(0, VISIBLE_ISSUES);
  const hiddenCount = validationIssues.length - VISIBLE_ISSUES;

  const onLoadSample = async () => {
    try {
      const sampleLevel = await loadLevelConfigFile("level_1");
      loadDraftLevel(sampleLevel, tileSize);
      setStatusMessage("Loaded sample level.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to load sample level.");
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
        setStatusMessage(parsedLevel.error.issues[0]?.message ?? "Invalid level JSON.");
        return;
      }

      loadDraftLevel(parsedLevel.data, tileSize);
      setStatusMessage(`Imported ${file.name}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to import level JSON.");
    } finally {
      event.target.value = "";
    }
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

  const onValidate = () => {
    const isValid = validateDraftLevel();
    setStatusMessage(isValid ? "Level is valid." : "Fix validation issues before exporting.");
  };

  return (
    <UIAccordionItem value="publish">
      <UIAccordionTrigger>Publish</UIAccordionTrigger>
      <UIAccordionContent className="flex flex-col gap-3">
        <EditorSection className="flex items-center gap-2">
          <StatusIcon className={`size-4 shrink-0 ${config.className}`} />
          <UITypography variant="medium" className={config.className}>
            {config.label}
          </UITypography>
        </EditorSection>

        {validationIssues.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            {visibleIssues.map((issue, index) => (
              <div
                key={`issue-${issue.path}-${index}`}
                className="flex items-start gap-2 border-l-2 border-amber-400/40 pl-2"
              >
                <div>
                  <UITypography variant="verySmall" className="font-medium">
                    {issue.path || "level"}
                  </UITypography>
                  <UITypography variant="verySmall" className="text-muted-foreground">
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
                {showAllIssues ? "Show less" : `Show ${hiddenCount} more`}
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
            Validate
          </UIButton>
          <UIButton onClick={onDownloadJson} size="sm">
            <Download />
            Export JSON
          </UIButton>
        </div>

        <div className="flex gap-1.5">
          <UIButton onClick={resetDraftLevel} variant="outline" size="xs">
            New
          </UIButton>
          <UIButton onClick={onLoadSample} variant="outline" size="xs">
            <Route />
            Sample
          </UIButton>
          <UIButton onClick={() => fileInputRef.current?.click()} variant="outline" size="xs">
            <FileUp />
            Import
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
