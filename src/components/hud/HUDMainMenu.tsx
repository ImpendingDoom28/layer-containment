import { FC } from "react";
import { ArrowRight } from "lucide-react";

import { UIButton } from "../ui/UIButton";
import { UITypography } from "../ui/UITypography";
import { HUDAudioControls } from "./HUDAudioControls";
import { HUDAlmanac } from "./HUDAlmanac";
import { HUDWrapper } from "./HUDWrapper";
import { HUDSidePanel } from "./HUDSidePanel";
import { useMenuState } from "./useMenuState";
import type { MenuActions } from "../../core/types/menu";

type HUDMainMenuProps = MenuActions;

export const HUDMainMenu: FC<HUDMainMenuProps> = ({
  onPlay,
  onOpenLevelEditor,
}) => {
  const {
    hasInteracted,
    activeView,
    setShowAlmanac,
    setShowAudioSettings,
  } = useMenuState();

  if (activeView === "audio") {
    return (
      <HUDSidePanel side="left">
        <div
          className={`w-full transition-all duration-700 ${hasInteracted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}
        >
          <HUDAudioControls />
        </div>
      </HUDSidePanel>
    );
  }

  if (activeView === "almanac") {
    return (
      <HUDSidePanel side="left">
        <div
          className={`w-full transition-all duration-700 ${hasInteracted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}
        >
          <HUDAlmanac onBack={() => setShowAlmanac(false)} />
        </div>
      </HUDSidePanel>
    );
  }

  return (
    <HUDWrapper className="pointer-events-none">
      <div
        className={`pointer-events-auto flex h-full w-full transition-all duration-1000 ease-out ${
          hasInteracted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-16"
        }`}
      >
        <div className="flex h-full w-[45%] max-w-xl flex-col justify-between bg-gradient-to-r from-black/80 via-black/60 to-transparent p-8 md:p-12">
          <div>
            <div className="mb-2 h-0.5 w-12 bg-primary" />
            <UITypography variant="small" className="uppercase tracking-[0.5em] text-primary">
              Strategy Game
            </UITypography>
          </div>

          <div className="flex flex-col gap-6">
            <div>
              <UITypography variant="h1" className="text-5xl md:text-7xl font-black leading-[0.9] tracking-tight">
                Tower
              </UITypography>
              <UITypography variant="h1" className="text-5xl md:text-7xl font-extralight leading-[0.9] tracking-tight text-primary">
                Defense
              </UITypography>
            </div>

            <UITypography variant="body" className="max-w-xs text-muted-foreground leading-relaxed">
              Defend your base against waves of enemies. Build towers
              strategically to survive.
            </UITypography>
          </div>

          <nav className="flex flex-col gap-1">
            {[
              { label: "Play", action: onPlay },
              { label: "Level Creator", action: onOpenLevelEditor },
              { label: "Enemy Almanac", action: () => setShowAlmanac(true) },
              { label: "Audio Settings", action: () => setShowAudioSettings(true) },
            ].map(({ label, action }) => (
              <UIButton
                key={label}
                onClick={action}
                variant="ghost"
                className="group justify-between border-b border-white/5 px-0 text-left text-sm font-light tracking-wide text-foreground hover:border-primary/30"
              >
                {label}
                <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
              </UIButton>
            ))}
          </nav>
        </div>
      </div>
    </HUDWrapper>
  );
};
