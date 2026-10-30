import { FC, memo, useCallback } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

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

type HUDMainMenuProps = MenuActions;

type ClosingView = "settings" | "almanac" | "levelPicker";

type MenuAction = Omit<UIButtonProps, "children" | "onClick"> & {
  // Locale key of the button label.
  labelKey:
    | "menu.play"
    | "menu.almanac"
    | "menu.settings"
    | "menu.levelCreator"
    | "menu.testingLevel";
  onClick: () => void;
};

// The 3D asset showcase is a developer aid: the /testing-level route stays
// reachable in every build, but its menu entry only appears in dev builds.
const isDevBuild = import.meta.env.DEV;

export const HUDMainMenu: FC<HUDMainMenuProps> = memo(
  ({ onStartGameWithLevel, onOpenLevelEditor, onOpenTestingLevel }) => {
    const { t } = useTranslation();
    const { menuRef, blurDimensions, setBlurDimensions } = useBlurBackdrop();

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

    const actions: MenuAction[] = [
      {
        labelKey: "menu.play",
        onClick: () => {
          cancelClose();
          onOpenLevelPicker();
        },
        variant: "default",
      },
      {
        labelKey: "menu.almanac",
        onClick: () => {
          cancelClose();
          onOpenAlmanac();
        },
      },
      {
        labelKey: "menu.settings",
        onClick: () => {
          cancelClose();
          onOpenSettings();
        },
      },
      {
        labelKey: "menu.levelCreator",
        onClick: onOpenLevelEditor,
        className: "mt-8",
      },
      ...(isDevBuild
        ? [
            {
              labelKey: "menu.testingLevel" as const,
              onClick: onOpenTestingLevel,
            },
          ]
        : []),
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
            className="ui-menu-tilt ui-menu-tilt-left relative flex h-full w-full max-w-xl flex-col justify-between p-4 sm:p-8 md:w-[45%] md:p-12"
            ref={menuRef}
          >
            <UIBadge text={t("menu.systemsOnline")} />

            <div className="flex flex-col gap-6">
              <div className="min-w-0">
                <UITypography
                  variant="h1"
                  className="text-3xl tracking-widest font-extralight md:text-4xl"
                >
                  {title[0]}
                </UITypography>
                <UITypography
                  variant="h1"
                  className="text-3xl tracking-widest font-extralight text-primary md:text-4xl"
                >
                  {title[1] ?? ""}
                </UITypography>
              </div>

              <UITypography
                variant="body"
                className="max-w-xs leading-relaxed tracking-widest text-muted-foreground"
              >
                {t("menu.tagline")}
              </UITypography>
            </div>

            <nav className="flex flex-col gap-1">
              {actions.map(({ labelKey, onClick, variant, className }) => {
                const isDefault = variant === "default";
                const label = t(labelKey);

                return (
                  <UIButton
                    key={labelKey}
                    data-testid={
                      labelKey === "menu.play" ? "main-menu-play" : undefined
                    }
                    onClick={onClick}
                    variant={variant ?? "ghost"}
                    className={cn(
                      "justify-between text-sm text-left group text-foreground hover:border-primary/30",
                      className
                    )}
                  >
                    <span className="transition-transform group-hover:translate-x-1">
                      {label}
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
            onSelectLevel={async (level, startingHealth) => {
              onCloseLevelPicker();
              await onStartGameWithLevel(level, startingHealth);
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
