import {
  createAudioVolumeStore,
  localStoragePersist,
} from "@webgamedevkit/audio-engine/stores";

import { GAME_NAME_ID } from "../../constants/game";

export const GAME_AUDIO_CATEGORIES = ["sfx", "music", "ambient"] as const;

export type GameAudioCategory = (typeof GAME_AUDIO_CATEGORIES)[number];

export const useAudioStore = createAudioVolumeStore({
  categories: GAME_AUDIO_CATEGORIES,
  persist: localStoragePersist(`${GAME_NAME_ID}-audio-settings-v2`),
  defaultMasterVolume: 10,
  defaultCategoryVolumes: {
    sfx: 50,
    music: 50,
    ambient: 50,
  },
});
