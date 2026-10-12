import { FC } from "react";

import { UICheckbox } from "../ui/UICheckbox";
import { UITypography } from "../ui/UITypography";
import {
  pauseWhenTabHiddenSelector,
  setPauseWhenTabHiddenSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";

export const HUDSettingsGeneralSection: FC = () => {
  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
  const setPauseWhenTabHidden = useSettingsStore(
    setPauseWhenTabHiddenSelector
  );

  return (
    <section className="flex flex-col gap-4">
      <UITypography variant="medium">General</UITypography>
      <div className="flex items-start gap-2">
        <UICheckbox
          id="pause-when-tab-hidden"
          checked={pauseWhenTabHidden}
          onCheckedChange={(checked) =>
            setPauseWhenTabHidden(checked === true)
          }
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="pause-when-tab-hidden"
            className="text-sm font-medium leading-none"
          >
            Pause when tab is hidden
          </label>
          <UITypography variant="small" className="text-muted-foreground">
            Uncheck to keep the game running while you are on another tab.
          </UITypography>
        </div>
      </div>
    </section>
  );
};
