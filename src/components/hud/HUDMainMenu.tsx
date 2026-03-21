import { FC } from "react";
import { ArrowRight } from "lucide-react";

import { UIButton, UIButtonProps } from "../ui/UIButton";
import { UITypography } from "../ui/UITypography";
import { HUDAudioControls } from "./HUDAudioControls";
import { HUDAlmanac } from "./HUDAlmanac";
import { HUDLevelPicker } from "./HUDLevelPicker";
import { HUDWrapper } from "./HUDWrapper";
import { HUDSidePanel } from "./HUDSidePanel";
import { useMenuState } from "./useMenuState";
import type { MenuActions } from "../../core/types/menu";
import { UIBadge } from "../ui/UIBadge";
import { cn } from "../ui/lib/twUtils";
import { GAME_NAME } from "../../constants/game";

type HUDMainMenuProps = MenuActions;

export const HUDMainMenu: FC<HUDMainMenuProps> = ({
  onStartGameWithLevel,
  onOpenLevelEditor,
}) => {
  const {
    hasInteracted,
    activeView,
    setShowAlmanac,
    setShowAudioSettings,
    setShowLevelPicker,
  } = useMenuState();

  const actions: Partial<UIButtonProps>[] = [
    {
      children: "Play",
      onClick: () => setShowLevelPicker(true),
      variant: "default",
    },
    { children: "Level Creator", onClick: onOpenLevelEditor },
    { children: "Enemy Almanac", onClick: () => setShowAlmanac(true) },
    {
      children: "Audio Settings",
      onClick: () => setShowAudioSettings(true),
    },
  ];

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

  if (activeView === "levelPicker") {
    return (
      <HUDSidePanel side="left">
        <div
          className={`w-full transition-all duration-700 ${hasInteracted ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}
        >
          <HUDLevelPicker
            onBack={() => setShowLevelPicker(false)}
            onSelectLevel={async (level) => {
              setShowLevelPicker(false);
              await onStartGameWithLevel(level);
            }}
          />
        </div>
      </HUDSidePanel>
    );
  }

  const title = GAME_NAME.split(" ");

  return (
    <HUDWrapper className="pointer-events-none">
      <div
        className={`pointer-events-auto flex h-full w-full transition-all duration-1000 ease-out ${
          hasInteracted
            ? "opacity-100 translate-x-0"
            : "opacity-0 -translate-x-16"
        }`}
      >
        <div className="flex h-full w-[45%] max-w-xl flex-col justify-between bg-gradient-to-r from-black/80 via-black/60 to-transparent p-8 md:p-12">
          <UIBadge text="Systems Online" />

          <div className="flex flex-col gap-6">
            <div>
              <UITypography
                variant="h1"
                className="tracking-widest font-extralight md:text-7xl"
              >
                {title[0]}
              </UITypography>
              <UITypography
                variant="h1"
                className="tracking-widest font-extralight md:text-7xl text-primary"
              >
                {title[1]}
              </UITypography>
            </div>

            <UITypography
              variant="body"
              className="max-w-xs leading-relaxed tracking-widest text-muted-foreground"
            >
              you’re not winning a war; — you’re holding a boundary.
            </UITypography>
          </div>

          <nav className="flex flex-col gap-1">
            {actions.map(({ children, onClick, variant }) => {
              const isDefault = variant === "default";

              return (
                <UIButton
                  key={children as string}
                  onClick={onClick}
                  variant={variant ?? "ghost"}
                  className="justify-between text-sm text-left group text-foreground hover:border-primary/30"
                >
                  <span className="transition-transform group-hover:translate-x-1">
                    {children}
                  </span>
                  <ArrowRight
                    className={cn(
                      "transition-transform size-4  group-hover:translate-x-1",
                      !isDefault &&
                        "text-muted-foreground group-hover:text-primary"
                    )}
                  />
                </UIButton>
              );
            })}
          </nav>
        </div>
      </div>
    </HUDWrapper>
  );
};
