import { FC } from "react";
import { useTranslation } from "react-i18next";

import { UICheckbox } from "../ui/UICheckbox";
import { UITypography } from "../ui/UITypography";
import {
  bloomEnabledSelector,
  setBloomEnabledSelector,
  setShadowsEnabledSelector,
  shadowsEnabledSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";

export const HUDSettingsQualitySection: FC = () => {
  const { t } = useTranslation();
  const bloomEnabled = useSettingsStore(bloomEnabledSelector);
  const setBloomEnabled = useSettingsStore(setBloomEnabledSelector);
  const shadowsEnabled = useSettingsStore(shadowsEnabledSelector);
  const setShadowsEnabled = useSettingsStore(setShadowsEnabledSelector);

  return (
    <section className="flex flex-col gap-4">
      <UITypography variant="body">{t("settings.quality")}</UITypography>
      <div className="flex items-start gap-2">
        <UICheckbox
          id="settings-bloom"
          checked={bloomEnabled}
          onCheckedChange={(checked) => setBloomEnabled(checked === true)}
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="settings-bloom"
            className="text-sm font-medium leading-none"
          >
            {t("settings.bloom")}
          </label>
          <UITypography variant="small" className="text-muted-foreground">
            {t("settings.bloomHint")}
          </UITypography>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <UICheckbox
          id="settings-shadows"
          checked={shadowsEnabled}
          onCheckedChange={(checked) => setShadowsEnabled(checked === true)}
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="settings-shadows"
            className="text-sm font-medium leading-none"
          >
            {t("settings.shadows")}
          </label>
          <UITypography variant="small" className="text-muted-foreground">
            {t("settings.shadowsHint")}
          </UITypography>
        </div>
      </div>
    </section>
  );
};
