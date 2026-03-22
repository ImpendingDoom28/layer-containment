import { FC, memo, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";

import { UIButton, UIButtonProps } from "../ui/UIButton";
import { UITypography } from "../ui/UITypography";
import { HUDAudioControls } from "./HUDAudioControls";
import { HUDAlmanac } from "./HUDAlmanac";
import { HUDLevelPicker } from "./levelPicker/HUDLevelPicker";
import { HUDWrapper } from "./HUDWrapper";
import { HUDSidePanel } from "./HUDSidePanel";
import { useMenuState } from "./useMenuState";
import type { MenuActions } from "../../core/types/menu";
import { GitHubMarkIcon } from "../ui/GitHubMarkIcon";
import { UIBadge } from "../ui/UIBadge";
import { cn, twTranslateXPercentFromViewportWidth } from "../ui/lib/twUtils";
import { GAME_NAME, REPOSITORY_URL } from "../../constants/game";

type HUDMainMenuProps = MenuActions;

export const HUDMainMenu: FC<HUDMainMenuProps> = memo(
  ({ onStartGameWithLevel, onOpenLevelEditor }) => {
    const menuRef = useRef<HTMLDivElement>(null);

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

    const [blurDimensions, setBlurDimensions] = useState({
      width: `${menuRef.current?.clientHeight}px`,
      height: `${menuRef.current?.clientWidth}px`,
    });
    const [viewportWidthPx, setViewportWidthPx] = useState(0);
    const [blurTranslateReferenceWidthPx, setBlurTranslateReferenceWidthPx] =
      useState(0);

    useLayoutEffect(() => {
      const updateLayoutMetrics = () => {
        setViewportWidthPx(window.innerWidth);
        if (menuRef.current) {
          const h = menuRef.current.clientHeight;
          const w = menuRef.current.clientWidth;
          setBlurTranslateReferenceWidthPx(h);
          setBlurDimensions({
            width: `${h}px`,
            height: `${w}px`,
          });
        }
      };

      updateLayoutMetrics();
      window.addEventListener("resize", updateLayoutMetrics);
      return () => window.removeEventListener("resize", updateLayoutMetrics);
    }, [activeView]);

    const renderedPart = () => {
      if (activeView === "audio") {
        return (
          <HUDSidePanel side="left">
            <div
              className={cn(
                `w-full transition-all duration-700`,
                hasInteracted
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-12"
              )}
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
              className={cn(
                `w-full transition-all duration-700`,
                hasInteracted
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-12"
              )}
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
              className={cn(
                `w-full transition-all duration-700`,
                hasInteracted
                  ? "opacity-100 translate-x-0"
                  : "opacity-0 -translate-x-12"
              )}
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
              className="relative flex h-full w-[45%] max-w-xl flex-col justify-between bg-gradient-to-r from-black to-transparent p-8 md:p-12"
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

    const blurTwTranslateX = (() => {
      if (isMenu && viewportWidthPx > 0 && blurTranslateReferenceWidthPx > 0) {
        return twTranslateXPercentFromViewportWidth(
          viewportWidthPx,
          blurTranslateReferenceWidthPx,
          -100
        );
      }
      return "-50%";
    })();

    return (
      <>
        {REPOSITORY_URL !== "" && (
          <UIButton
            asChild
            variant="ghost"
            size="icon-lg"
            className="pointer-events-auto fixed top-6 right-6 z-[100] border border-transparent text-muted-foreground hover:border-primary/30 hover:text-primary md:right-8"
          >
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
            >
              <GitHubMarkIcon />
            </a>
          </UIButton>
        )}
        {hasInteracted && (
          <div className="absolute inset-0 z-10">
            <div
              className={cn(
                "absolute transition-all ease-in-out -rotate-90 translate-x-0 -translate-y-1/2 top-1/2 left-1/2 -z-10 will-change-transform bg-transparent",
                isMenu
                  ? "duration-1000 backdrop-blur-sm"
                  : "duration-300 backdrop-blur-xl"
              )}
              style={{
                mask: isMenu
                  ? "linear-gradient(black, black, transparent)"
                  : "none",
                width: blurDimensions.width,
                height: "100vw",
                // @ts-expect-error tailwind variable
                "--tw-translate-x": blurTwTranslateX,
              }}
            />
          </div>
        )}
        {renderedPart()}
      </>
    );
  }
);

HUDMainMenu.displayName = "HUDMainMenu";
