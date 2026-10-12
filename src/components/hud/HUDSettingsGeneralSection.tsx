import { FC } from "react";

import { UICheckbox } from "../ui/UICheckbox";
import { UITypography } from "../ui/UITypography";
import {
  noPauseDuringWaveWaitSelector,
  pauseWhenTabHiddenSelector,
  setNoPauseDuringWaveWaitSelector,
  setPauseWhenTabHiddenSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";

export const HUDSettingsGeneralSection: FC = () => {
  const pauseWhenTabHidden = useSettingsStore(pauseWhenTabHiddenSelector);
  const setPauseWhenTabHidden = useSettingsStore(
    setPauseWhenTabHiddenSelector
  );
  const noPauseDuringWaveWait = useSettingsStore(
    noPauseDuringWaveWaitSelector
  );
  const setNoPauseDuringWaveWait = useSettingsStore(
    setNoPauseDuringWaveWaitSelector
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
      <div className="flex items-start gap-2">
        <UICheckbox
          id="no-pause-during-wave-wait"
          checked={noPauseDuringWaveWait}
          onCheckedChange={(checked) =>
            setNoPauseDuringWaveWait(checked === true)
          }
        />
        <div className="flex flex-col gap-1">
          <label
            htmlFor="no-pause-during-wave-wait"
            className="text-sm font-medium leading-none"
          >
            No pause while waiting for the next wave
          </label>
          <UITypography variant="small" className="text-muted-foreground">
            Pause is disabled between waves, so the game can&apos;t be paused
            while you wait for the next wave to start.
          </UITypography>
        </div>
      </div>
    </section>
  );
};
