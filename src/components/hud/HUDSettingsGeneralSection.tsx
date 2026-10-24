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
import {
  HUD_THEME_IDS,
  hudThemeSelector,
  setHudThemeSelector,
  useHudThemeStore,
  type HudThemeId,
} from "../../core/stores/useHudThemeStore";

export const HUDSettingsGeneralSection: FC = () => {
  const { t } = useTranslation();
  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
  const setPauseWhenTabHidden = useSettingsStore(setPauseWhenTabHiddenSelector);
  const language = useSettingsStore(languageSelector);
  const setLanguage = useSettingsStore(setLanguageSelector);
  const hudTheme = useHudThemeStore(hudThemeSelector);
  const setHudTheme = useHudThemeStore(setHudThemeSelector);

  return (
    <section className="flex flex-col gap-4">
      <UITypography variant="body">{t("settings.general")}</UITypography>
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
          onChange={(event) => setLanguage(event.target.value as LanguageId)}
        >
          {LANGUAGE_IDS.map((languageId) => (
            <option key={languageId} value={languageId}>
              {LANGUAGE_NAMES[languageId]}
            </option>
          ))}
        </UISelect>
      </div>
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor="settings-hud-theme"
          className="text-sm font-medium leading-none"
        >
          {t("settings.hudTheme")}
        </label>
        <UISelect
          id="settings-hud-theme"
          className="ml-auto"
          value={hudTheme}
          aria-label={t("settings.hudTheme")}
          onChange={(event) => setHudTheme(event.target.value as HudThemeId)}
        >
          {HUD_THEME_IDS.map((themeId) => (
            <option key={themeId} value={themeId}>
              {t(`hudTheme.${themeId}`)}
            </option>
          ))}
        </UISelect>
      </div>
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
    </section>
  );
};
