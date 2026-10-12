import { FC } from "react";
import { ArrowLeft } from "lucide-react";

import { UIButton } from "../ui/buttons/UIButton";
import {
  UICard,
  UICardContent,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import {
  setShowSettingsSelector,
  showSettingsSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import { UITypography } from "../ui/UITypography";
import { HUDSettingsAudioSection } from "./HUDSettingsAudioSection";
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
  const showSettings = useGameStore(showSettingsSelector);
  const setShowSettings = useGameStore(setShowSettingsSelector);

  if (!showSettings) return null;

  const handleBack = () => (onBack ? onBack() : setShowSettings(false));

  return (
    <UICard className={cn("w-full", className)}>
      <UICardHeader>
        <UICardTitle>
          <UIButton
            onClick={handleBack}
            variant="ghost"
            size="icon"
          >
            <ArrowLeft />
          </UIButton>
          <UITypography variant="body">Settings</UITypography>
        </UICardTitle>
      </UICardHeader>
      <UICardContent className="gap-8 overflow-y-auto">
        <HUDSettingsGeneralSection />
        <HUDSettingsAudioSection />
      </UICardContent>
    </UICard>
  );
};
