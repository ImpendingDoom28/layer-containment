import { loadAudioBuffer } from "../../spatial-audio/core/bufferLoader";
import { generatePlaceholderSound } from "../../spatial-audio/core/proceduralSounds";
import {
  UI_ACTION_DENIED_SFX_NOISE_DURATION_SEC,
  UI_ACTION_DENIED_SFX_NOISE_PLACEHOLDER_FREQ_HZ,
} from "../../constants/uiActionDeniedFeedback";
import { GameEvent } from "../../core/types/enums/events";

import {
  type AudioEventData,
  SOUND_CONFIGS,
} from "./gameSoundConfig";

export const resolveGameSoundBuffer = async (
  audioContext: AudioContext,
  event: GameEvent,
  eventData?: unknown
): Promise<AudioBuffer | null> => {
  switch (event) {
    case GameEvent.TOWER_PLACED:
      return generatePlaceholderSound(audioContext, "click", 0.15, 600);
    case GameEvent.TOWER_SOLD:
      return generatePlaceholderSound(audioContext, "click", 0.1, 400);
    case GameEvent.TOWER_FIRE: {
      const data = eventData as AudioEventData<"tower_fire"> | undefined;
      const soundName = data?.towerType;
      const url = soundName
        ? SOUND_CONFIGS[event].srces?.[soundName]
        : undefined;

      if (url && soundName) {
        const audioBuffer = await loadAudioBuffer(
          audioContext,
          url,
          `${event}-${soundName}`
        );
        if (audioBuffer) {
          return audioBuffer;
        }
      }

      return generatePlaceholderSound(audioContext, "click", 0.15, 600);
    }
    case GameEvent.ENEMY_KILLED:
      return generatePlaceholderSound(audioContext, "tone", 0.2, 300);
    case GameEvent.ENEMY_REACHED_END:
      return generatePlaceholderSound(audioContext, "tone", 0.3, 200);
    case GameEvent.PROJECTILE_HIT:
      return generatePlaceholderSound(audioContext, "click", 0.08, 1000);
    case GameEvent.WAVE_STARTED:
      return generatePlaceholderSound(audioContext, "whoosh", 0.5, 200);
    case GameEvent.GAME_OVER:
      return generatePlaceholderSound(audioContext, "tone", 0.5, 150);
    case GameEvent.GAME_WON:
      return generatePlaceholderSound(audioContext, "tone", 0.6, 400);
    case GameEvent.GAME_PAUSED:
      return generatePlaceholderSound(audioContext, "click", 0.1, 500);
    case GameEvent.GAME_RESUMED:
      return generatePlaceholderSound(audioContext, "click", 0.1, 600);
    case GameEvent.UI_CLICK:
      return generatePlaceholderSound(audioContext, "click", 0.05, 1000);
    case GameEvent.UI_ACTION_DENIED:
      return generatePlaceholderSound(
        audioContext,
        "noise",
        UI_ACTION_DENIED_SFX_NOISE_DURATION_SEC,
        UI_ACTION_DENIED_SFX_NOISE_PLACEHOLDER_FREQ_HZ
      );
    default:
      return generatePlaceholderSound(audioContext, "tone", 0.1, 440);
  }
};
