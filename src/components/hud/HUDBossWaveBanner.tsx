import { FC, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { UITypography } from "../ui/UITypography";
import { GameEvent } from "../../core/types/enums/events";
import { useLevelStore } from "../../core/stores/useLevelStore";
import { isBossWave } from "../../utils/bossHp";
import { gameEvents } from "../../utils/eventEmitter";
import { HUDWrapper } from "./HUDWrapper";

// Keep in sync with `--animate-boss-wave-banner` in styles/index.css.
const BANNER_DURATION_MS = 2600;

type WaveStartedData = {
  waveNumber: number;
};

type BannerState = {
  key: number;
};

/**
 * A one-shot "BOSS WAVE" flash shown when a boss wave starts. Listens for the
 * `WAVE_STARTED` event, and when the incoming wave is one of the level's boss
 * waves it mounts a centered banner that plays a fade-in/hold/fade-out
 * animation once (the inner element is keyed so the animation restarts on each
 * boss wave) and unmounts itself after the animation completes. It does not
 * block camera input (`pointer-events-none`).
 */
export const HUDBossWaveBanner: FC = () => {
  const { t } = useTranslation();
  const [banner, setBanner] = useState<BannerState | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerCounter = useRef(0);

  useEffect(() => {
    const unsubscribe = gameEvents.on<WaveStartedData>(
      GameEvent.WAVE_STARTED,
      (data) => {
        if (!data?.waveNumber) return;
        const boss = useLevelStore.getState().boss;
        if (!isBossWave(boss, data.waveNumber)) return;

        bannerCounter.current += 1;
        setBanner({ key: bannerCounter.current });

        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(
          () => setBanner(null),
          BANNER_DURATION_MS
        );
      }
    );

    return () => {
      unsubscribe();
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  if (!banner) return null;

  return (
    <HUDWrapper
      className="pointer-events-none items-center justify-center"
      data-testid="boss-wave-banner"
    >
      <div key={banner.key} className="animate-boss-wave-banner">
        <div className="flex items-center gap-4">
          <Icon
            name="Skull"
            color="red3"
            size={40}
            className="shrink-0 drop-shadow-[0_0_12px_rgba(248,113,113,0.7)]"
          />
          <UITypography
            variant="h2"
            whiteSpace="nowrap"
            className="tracking-[0.35em] text-red-400 drop-shadow-[0_0_18px_rgba(248,113,113,0.85)]"
          >
            {t("bossWaveBanner.title")}
          </UITypography>
          <Icon
            name="Skull"
            color="red3"
            size={40}
            className="shrink-0 drop-shadow-[0_0_12px_rgba(248,113,113,0.7)]"
          />
        </div>
      </div>
    </HUDWrapper>
  );
};

HUDBossWaveBanner.displayName = "HUDBossWaveBanner";
