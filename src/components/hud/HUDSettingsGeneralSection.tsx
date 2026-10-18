import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UICheckbox } from "../ui/UICheckbox";
import { UITypography } from "../ui/UITypography";
import { UISelect } from "../ui/UISelect";
import {
  LANGUAGE_IDS,
  LANGUAGE_NAMES,
  type LanguageId,
} from "../../core/i18n/languages";
import {
  languageSelector,
  pauseWhenTabHiddenSelector,
  setLanguageSelector,
  setPauseWhenTabHiddenSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";

export const HUDSettingsGeneralSection: FC = () => {
  const { t } = useTranslation();
  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
  const setPauseWhenTabHidden = useSettingsStore(setPauseWhenTabHiddenSelector);
  const language = useSettingsStore(languageSelector);
  const setLanguage = useSettingsStore(setLanguageSelector);

  return (
    <section className="flex flex-col gap-4">
      <UITypography variant="body">{t("settings.general")}</UITypography>
      <div className="flex items-start gap-2">
        <UICheckbox
          id="pause-when-tab-hidden"
          checked={pauseWhenTabHidden}
          onCheckedChange={(checked) => setPauseWhenTabHidden(checked === true)}
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="pause-when-tab-hidden"
            className="text-sm font-medium leading-none"
          >
            {t("settings.pauseWhenTabHidden")}
          </label>
          <UITypography variant="small" className="text-muted-foreground">
            {t("settings.pauseWhenTabHiddenHint")}
          </UITypography>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="settings-language"
          className="text-sm font-medium leading-none"
        >
          {t("settings.language")}
        </label>
        <UISelect
          id="settings-language"
          className="ml-auto"
          value={language}
          aria-label={t("settings.language")}
          onChange={(event) =>
            setLanguage(event.target.value as LanguageId)
          }
        >
          {LANGUAGE_IDS.map((languageId) => (
            <option key={languageId} value={languageId}>
              {LANGUAGE_NAMES[languageId]}
            </option>
          ))}
        </UISelect>
      </div>
    </section>
  );
};
