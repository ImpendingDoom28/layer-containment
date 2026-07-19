import { FC, memo } from "react";
import { ArrowRight } from "lucide-react";

import { UIButton, UIButtonProps } from "../../ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { HUDAudioControls } from "../HUDAudioControls";
import { HUDAlmanac } from "../HUDAlmanac";
import { HUDLevelPicker } from "../levelPicker/HUDLevelPicker";
import { HUDWrapper } from "../HUDWrapper";
import { HUDSidePanel } from "../HUDSidePanel";
import { useMenuState } from "../useMenuState";
import type { MenuActions } from "../../../core/types/menu";
import { UIBadge } from "../../ui/UIBadge";
import { cn } from "../../ui/lib/twUtils";
import { GAME_NAME } from "../../../constants/game";
import { BlurBackdrop } from "./BlurBackdrop";
import { GithubButton } from "./GithubButton";
import { useBlurBackdrop } from "../../../core/hooks/utils/useBlurBackdrop";

type HUDMainMenuProps = MenuActions;

export const HUDMainMenu: FC<HUDMainMenuProps> = memo(
  ({ onStartGameWithLevel, onOpenLevelEditor }) => {
    const { menuRef, blurDimensions, setBlurDimensions } = useBlurBackdrop();

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
      { children: "Enemy Almanac", onClick: () => setShowAlmanac(true) },
      {
        children: "Audio Settings",
        onClick: () => setShowAudioSettings(true),
      },
      {
        children: "Level Creator",
        onClick: onOpenLevelEditor,
        className: "mt-8",
      },
    ];

    const title = GAME_NAME.split(" ");

    const isMenu = activeView === "menu";

    const renderedPart = () => {
      if (!isMenu) {
        return (
          <HUDSidePanel side="left">
            {activeView === "audio" && <HUDAudioControls />}
            {activeView === "almanac" && (
              <HUDAlmanac onBack={() => setShowAlmanac(false)} />
            )}
            {activeView === "levelPicker" && (
              <HUDLevelPicker
                onBack={() => setShowLevelPicker(false)}
                onSelectLevel={async (level) => {
                  setShowLevelPicker(false);
                  await onStartGameWithLevel(level);
                }}
              />
            )}
          </HUDSidePanel>
        );
      }

      return (
        <HUDWrapper className="pointer-events-none">
          <div
            className={cn(
              `relative pointer-events-auto flex h-full w-full transition-all duration-1000 ease-out`,
              hasInteracted
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-16"
            )}
          >
            <div
              className="relative flex h-full w-[45%] max-w-xl flex-col justify-between p-8 md:p-12"
              ref={menuRef}
            >
              <UIBadge text="Systems Online" />

              <div className="flex flex-col gap-6">
                <div className="min-w-0">
                  <UITypography
                    variant="h1"
                    className="tracking-widest font-extralight"
                  >
                    {title[0]}
                  </UITypography>
                  <UITypography
                    variant="h1"
                    className="tracking-widest font-extralight text-primary"
                  >
                    {title[1] ?? ""}
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
                {actions.map(({ children, onClick, variant, className }) => {
                  const isDefault = variant === "default";

                  return (
                    <UIButton
                      key={children as string}
                      onClick={onClick}
                      variant={variant ?? "ghost"}
                      className={cn(
                        "justify-between text-sm text-left group text-foreground hover:border-primary/30",
                        className
                      )}
                    >
                      <span className="transition-transform group-hover:translate-x-1">
                        {children}
                      </span>
                      <ArrowRight
                        className={cn(
                          "transition-transform size-4 group-hover:translate-x-1",
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

    return (
      <>
        <GithubButton hasInteracted={hasInteracted} />
        <BlurBackdrop
          hasInteracted={hasInteracted}
          isMenu={isMenu}
          blurDimensions={blurDimensions}
          setBlurDimensions={setBlurDimensions}
          menuRef={menuRef}
        />
        {renderedPart()}
      </>
    );
  }
);

HUDMainMenu.displayName = "HUDMainMenu";
