import { loadAudioBuffer } from "@webgamedevkit/audio-engine";

import {
  UI_ACTION_DENIED_SFX_NOISE_DURATION_SEC,
  UI_ACTION_DENIED_SFX_NOISE_PLACEHOLDER_FREQ_HZ,
} from "../../constants/uiActionDeniedFeedback";
import { GameEvent } from "../../core/types/enums/events";

import { TOWER_FIRE_SRCES, type TowerFireSrcKey } from "./gameSoundConfig";
import { generatePlaceholderSound } from "./generatePlaceholderSound";

const TOWER_FIRE_SRC_KEYS = Object.keys(TOWER_FIRE_SRCES) as TowerFireSrcKey[];

const isTowerFireSrcKey = (value: unknown): value is TowerFireSrcKey =>
  typeof value === "string" &&
  TOWER_FIRE_SRC_KEYS.includes(value as TowerFireSrcKey);

const resolveTowerFireSrcKey = (data: unknown): TowerFireSrcKey => {
  if (
    typeof data === "object" &&
    data !== null &&
    "srcKey" in data &&
    isTowerFireSrcKey(data.srcKey)
  ) {
    return data.srcKey;
  }

  return "basic";
};

export const resolveGameSoundBuffer = async (
  audioContext: AudioContext,
  event: GameEvent,
  data?: unknown
): Promise<AudioBuffer | null> => {
  switch (event) {
    case GameEvent.TOWER_FIRE: {
      const srcKey = resolveTowerFireSrcKey(data);
      const url = TOWER_FIRE_SRCES[srcKey];
      return loadAudioBuffer(audioContext, url);
    }
    case GameEvent.TOWER_PLACED:
      return generatePlaceholderSound(audioContext, "click", 0.15, 600);
    case GameEvent.TOWER_SOLD:
      return generatePlaceholderSound(audioContext, "click", 0.1, 400);
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
    case GameEvent.UI_ACTION_HOLD_START:
    case GameEvent.UI_ACTION_HOLD_END:
    case GameEvent.UI_ACTION_HOLD_ABORT:
      return null;
    default:
      return generatePlaceholderSound(audioContext, "tone", 0.1, 440);
  }
};
