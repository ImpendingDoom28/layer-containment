import { FC } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../ui/Icon";
import { UIButton } from "../ui/buttons/UIButton";
import { UICard, UICardContent, UICardHeader, UICardTitle } from "../ui/UICard";
import {
  setShowSettingsSelector,
  showSettingsSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { UITypography } from "../ui/UITypography";
import { HUDSettingsAudioSection } from "./HUDSettingsAudioSection";
import { HUDSettingsControlsSection } from "./HUDSettingsControlsSection";
import { HUDSettingsGeneralSection } from "./HUDSettingsGeneralSection";
import { cn } from "../ui/lib/twUtils";

type HUDSettingsProps = {
  className?: string;
  onBack?: () => void;
};

export const HUDSettings: FC<HUDSettingsProps> = ({
  className = "",
  onBack,
}) => {
  const { t } = useTranslation();
  const showSettings = useGameStore(showSettingsSelector);
  const setShowSettings = useGameStore(setShowSettingsSelector);

  if (!showSettings) return null;

  const handleBack = () => (onBack ? onBack() : setShowSettings(false));

  return (
    <UICard className={cn("h-full w-full bg-transparent", className)}>
      <UICardHeader>
        <UICardTitle>
          <UIButton onClick={handleBack} variant="ghost" size="icon">
            <Icon name="ArrowLeft" />
          </UIButton>
          <UITypography variant="h4">{t("settings.title")}</UITypography>
        </UICardTitle>
      </UICardHeader>
      <UICardContent className="flex-1 min-h-0 gap-8 overflow-y-auto">
        <HUDSettingsGeneralSection />
        <HUDSettingsAudioSection />
        <HUDSettingsControlsSection />
      </UICardContent>
    </UICard>
  );
};
