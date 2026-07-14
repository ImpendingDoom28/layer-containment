import { createAudioVolumeStore } from "../../spatial-audio/stores/createAudioVolumeStore";
import { MAX_VOLUME, MIN_VOLUME } from "../../spatial-audio/core/volume";
import { GAME_NAME_ID } from "../../constants/game";

export { MAX_VOLUME, MIN_VOLUME };

export const GAME_AUDIO_CATEGORIES = ["sfx", "music", "ambient"] as const;

export type GameAudioCategory = (typeof GAME_AUDIO_CATEGORIES)[number];

export const useAudioStore = createAudioVolumeStore({
  persistKey: `${GAME_NAME_ID}-audio-settings-v2`,
  categories: GAME_AUDIO_CATEGORIES,
  defaultCategoryVolumes: {
    sfx: 50,
    music: 50,
    ambient: 50,
  },
});
