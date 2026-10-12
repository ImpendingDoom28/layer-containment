import { FC, memo, useCallback } from "react";
import { ArrowRight } from "lucide-react";

import { UIButton, UIButtonProps } from "../../ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { HUDSettings } from "../HUDSettings";
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
import { useHeldClose } from "../../../core/hooks/useHeldClose";
import { useNavigate } from "react-router-dom";

type HUDMainMenuProps = MenuActions;

type ClosingView = "settings" | "almanac" | "levelPicker";

export const HUDMainMenu: FC<HUDMainMenuProps> = memo(
  ({ onStartGameWithLevel, onOpenLevelEditor }) => {
    const { menuRef, blurDimensions, setBlurDimensions } = useBlurBackdrop();

    const navigate = useNavigate();

    const {
      hasInteracted,
      activeView,
      onOpenSettings,
      onOpenAlmanac,
      onOpenLevelPicker,
      onCloseAlmanac,
      onCloseLevelPicker,
      setShowSettings,
    } = useMenuState();

    const { closing, startClose, finishClose, cancelClose } = useHeldClose();

    const startClosing = useCallback(
      (view: ClosingView) => {
        const action =
          view === "settings"
            ? () => setShowSettings(false)
            : view === "almanac"
              ? () => onCloseAlmanac()
              : () => onCloseLevelPicker();
        startClose(action);
      },
      [startClose, setShowSettings, onCloseAlmanac, onCloseLevelPicker]
    );

    const handlePanelExited = useCallback(() => {
      finishClose();
    }, [finishClose]);

    const actions: Partial<UIButtonProps>[] = [
      {
        children: "Play",
        onClick: () => {
          cancelClose();
          onOpenLevelPicker();
        },
        variant: "default",
      },
      {
        children: "Enemy Almanac",
        onClick: () => {
          cancelClose();
          onOpenAlmanac();
        },
      },
      {
        children: "Settings",
        onClick: () => {
          cancelClose();
          onOpenSettings();
        },
      },
      {
        children: "Level Creator",
        onClick: onOpenLevelEditor,
        className: "mt-8",
      },
      {
        children: "ECS",
        onClick: () => {
          navigate("/ecs");
        },
      },
    ];

    const title = GAME_NAME.split(" ");

    const isMenu = activeView === "menu";

    const menuPart = (
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
            className="ui-menu-tilt ui-menu-tilt-left relative flex h-full w-[45%] max-w-xl flex-col justify-between p-8 md:p-12"
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

    const panelPart = !isMenu && (
      <HUDSidePanel side="left" closing={closing} onExited={handlePanelExited}>
        {activeView === "settings" && (
          <HUDSettings onBack={() => startClosing("settings")} />
        )}
        {activeView === "almanac" && (
          <HUDAlmanac onBack={() => startClosing("almanac")} />
        )}
        {activeView === "levelPicker" && (
          <HUDLevelPicker
            onBack={() => startClosing("levelPicker")}
            onSelectLevel={async (level) => {
              onCloseLevelPicker();
              await onStartGameWithLevel(level);
            }}
          />
        )}
      </HUDSidePanel>
    );

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
        {(isMenu || closing) && menuPart}
        {panelPart}
      </>
    );
  }
);

HUDMainMenu.displayName = "HUDMainMenu";
