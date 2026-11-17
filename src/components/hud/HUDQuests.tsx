import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UICheckbox } from "../ui/UICheckbox";
import { UITypography } from "../ui/UITypography";
import { getQuestsProgress } from "../../core/quests/evaluateQuests";
import {
  questCountersSelector,
  questsSelector,
  useQuestStore,
} from "../../core/stores/useQuestStore";
import type { EnemyType } from "../../core/types/game";
import type { QuestConfig, QuestProgress } from "../../core/types/quests";

type QuestRowProps = {
  quest: QuestConfig;
  progress: QuestProgress;
  /** Side quests are de-emphasised: muted text and a neutral check. */
  additional: boolean;
};

const QuestRow: FC<QuestRowProps> = ({ quest, progress, additional }) => {
  const { t } = useTranslation();
  // A per-enemy-type quest ("defeat N <type>") is written once per level with
  // the type's i18n name interpolated in the component, so the same quest JSON
  // stays portable across languages and the label never goes stale.
  const killsByType = quest.counters.killsByType;
  const typeEntry = Object.entries(killsByType ?? {})[0] as
    | [EnemyType, number]
    | undefined;
  // `labelKey` is data-driven (from the level JSON) and `labelParams` is an
  // open record, so the generic i18next key/option typing doesn't fit it; a
  // permissive call keeps the keys type-checked where they are literals.
  const tFree = t as unknown as (
    key: string,
    params?: Record<string, string | number>
  ) => string;
  const label =
    typeEntry !== undefined
      ? t("quests.defeatType", {
          type: t(`enemies.${typeEntry[0]}.name`),
          count: typeEntry[1],
        })
      : tFree(quest.labelKey, quest.labelParams);

  const failed = progress.failed;
  const complete = progress.complete;

  return (
    <div
      data-testid={`quest-row-${quest.id}`}
      data-state={failed ? "failed" : complete ? "complete" : "open"}
      className={`flex items-center gap-2 ${additional ? "opacity-60" : ""}`}
    >
      <UICheckbox
        checked={complete}
        failed={failed}
        disabled
        aria-label={label}
        className="border-white/40"
      />
      <UITypography
        variant="body"
        className={`min-w-0 flex-1 ${
          failed
            ? "text-destructive"
            : complete
              ? "text-muted-foreground line-through"
              : additional
                ? "text-muted-foreground"
                : ""
        }`}
      >
        {label}
      </UITypography>
      <UITypography
        variant="small"
        whiteSpace="nowrap"
        className={`${
          failed ? "text-destructive" : ""
        } ${additional ? "text-muted-foreground" : ""}`}
      >
        {progress.current}/{progress.target}
      </UITypography>
    </div>
  );
};

/**
 * The level's objectives card: main quests first, a divider, then the
 * additional (bonus) quests in a de-emphasised style. Fully transparent
 * (no panel or card), a checkbox per quest that checks off on completion and
 * shows a red X once failed, with a `current/target` count. Rendered right
 * below the game stats card (`HUDGameStats`). Returns `null` for levels
 * without quests.
 */
export const HUDQuests: FC = () => {
  const { t } = useTranslation();
  const quests = useQuestStore(questsSelector);
  const counters = useQuestStore(questCountersSelector);

  if (quests.length === 0) {
    return null;
  }

  const progress = getQuestsProgress(quests, counters);
  const mainQuests = quests.filter((quest) => !quest.additional);
  const additionalQuests = quests.filter((quest) => quest.additional);
  const fallbackProgress: QuestProgress = {
    current: 0,
    target: 0,
    complete: false,
    failed: false,
  };

  return (
    <div data-testid="quests-card" className="w-80">
      <div
        data-testid="quests-main"
        className="flex flex-col gap-1.5"
      >
        <UITypography variant="small" className="tracking-wider text-muted-foreground">
          {t("quests.objectives")}
        </UITypography>
        <div className="h-px w-full bg-white/20" />
        {mainQuests.map((quest) => (
          <QuestRow
            key={quest.id}
            quest={quest}
            progress={progress.get(quest.id) ?? fallbackProgress}
            additional={false}
          />
        ))}
      </div>

      {additionalQuests.length > 0 && (
        <div
          data-testid="quests-additional"
          className="mt-4 flex flex-col gap-1.5"
        >
          <UITypography variant="small" className="tracking-wider text-muted-foreground/80">
            {t("quests.bonus")}
          </UITypography>
          <div className="h-px w-full bg-white/20" />
          {additionalQuests.map((quest) => (
            <QuestRow
              key={quest.id}
              quest={quest}
              progress={progress.get(quest.id) ?? fallbackProgress}
              additional
            />
          ))}
        </div>
      )}
    </div>
  );
};
