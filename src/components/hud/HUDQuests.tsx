import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
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

  return (
    <div
      data-testid={`quest-row-${quest.id}`}
      className={`flex items-center gap-2 ${
        additional ? "opacity-60" : ""
      }`}
    >
      <Icon
        name={progress.complete ? "Check" : "Plus"}
        color={progress.complete ? (additional ? "muted" : "green") : undefined}
        size={14}
        className="shrink-0"
      />
      <UITypography
        variant="body"
        className={`min-w-0 flex-1 ${
          progress.complete
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
        className={additional ? "text-muted-foreground" : ""}
      >
        {progress.current}/{progress.target}
      </UITypography>
    </div>
  );
};

/**
 * The level's objectives card: main quests first, a divider, then the
 * additional (bonus) quests in a de-emphasised style. Transparent background
 * (no `UICard`), a checkbox per quest that checks off on completion with a
 * `current/target` count. Rendered right below the game stats card
 * (`HUDGameStats`). Returns `null` for levels without quests.
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

  return (
    <div data-testid="quests-card" className="w-80">
      <div className="flex flex-col gap-2">
        <div
          data-testid="quests-main"
          className="flex flex-col gap-1.5 rounded-md bg-black/30 p-2.5 backdrop-blur-sm"
        >
          <UITypography variant="small" className="uppercase tracking-wider text-muted-foreground">
            {t("quests.objectives")}
          </UITypography>
          {mainQuests.map((quest) => (
            <QuestRow
              key={quest.id}
              quest={quest}
              progress={progress.get(quest.id) ?? {
                current: 0,
                target: 0,
                complete: false,
              }}
              additional={false}
            />
          ))}
        </div>

        {additionalQuests.length > 0 && (
          <div
            data-testid="quests-additional"
            className="flex flex-col gap-1.5 rounded-md bg-black/20 p-2.5"
          >
            <UITypography variant="small" className="uppercase tracking-wider text-muted-foreground/80">
              {t("quests.bonus")}
            </UITypography>
            {additionalQuests.map((quest) => (
              <QuestRow
                key={quest.id}
                quest={quest}
                progress={progress.get(quest.id) ?? {
                  current: 0,
                  target: 0,
                  complete: false,
                }}
                additional
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
