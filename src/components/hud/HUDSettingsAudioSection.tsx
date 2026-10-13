import { FC } from "react";
import { Volume2, VolumeX } from "lucide-react";

import {
  GAME_AUDIO_CATEGORIES,
  type GameAudioCategory,
  useAudioStore,
} from "../../core/audio/useAudioStore";
import { UIButton } from "../ui/buttons/UIButton";
import { UISlider } from "../ui/UISlider";
import { UITypography } from "../ui/UITypography";

type AudioSliderProps = {
  volume: number;
  setVolume: (volume: number) => void;
  disabled: boolean;
  label: string;
  sliderId: string;
};

const CATEGORY_LABELS: Record<GameAudioCategory, string> = {
  sfx: "Sound Effects",
  music: "Music",
  ambient: "Ambient",
};

const defaultSliderProps = {
  min: 0,
  max: 100,
  step: 0.1,
};

const AudioSlider: FC<AudioSliderProps> = ({
  sliderId,
  volume,
  setVolume,
  disabled,
  label,
}) => {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label
          aria-disabled={disabled}
          htmlFor={sliderId}
          className="text-sm font-medium aria-disabled:opacity-50"
        >
          {label}
        </label>
        <span className="text-xs text-gray-400">{`${Math.round(volume).toString()}%`}</span>
      </div>
      <UISlider
        id={sliderId}
        {...defaultSliderProps}
        disabled={disabled}
        value={[volume]}
        onValueChange={(value) => {
          setVolume(value[0]);
        }}
      />
    </div>
  );
};

export const HUDSettingsAudioSection: FC = () => {
  const masterVolume = useAudioStore((state) => state.masterVolume);
  const categoryVolumes = useAudioStore((state) => state.categoryVolumes);
  const muted = useAudioStore((state) => state.muted);
  const setMasterVolume = useAudioStore((state) => state.setMasterVolume);
  const setCategoryVolume = useAudioStore((state) => state.setCategoryVolume);
  const toggleMute = useAudioStore((state) => state.toggleMute);

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <UITypography variant="body">Audio</UITypography>
        <UIButton
          onClick={toggleMute}
          variant={muted ? "destructive" : "outline"}
          size="icon"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <VolumeX className="size-4" />
          ) : (
            <Volume2 className="size-4" />
          )}
        </UIButton>
      </div>
      <AudioSlider
        volume={masterVolume}
        setVolume={setMasterVolume}
        disabled={muted}
        label="Master Volume"
        sliderId="master-volume"
      />
      {GAME_AUDIO_CATEGORIES.map((category) => (
        <AudioSlider
          key={category}
          volume={categoryVolumes[category]}
          setVolume={(volume) => setCategoryVolume(category, volume)}
          disabled={muted}
          label={CATEGORY_LABELS[category]}
          sliderId={`${category}-volume`}
        />
      ))}
    </section>
  );
};
