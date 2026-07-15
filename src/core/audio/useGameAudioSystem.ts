import { useEffect } from "react";
import { useSpatialAudioEngine } from "@webgamedevkit/audio-engine/react";

import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../../core/types/enums/events";

import { type AudioEventData, SOUND_CONFIGS } from "./gameSoundConfig";
import { resolveGameSoundBuffer } from "./gameSoundResolver";
import { mapEventToPlayPayload } from "./mapEventToPlayPayload";
import { useAudioStore } from "./useAudioStore";

export const useGameAudioSystem = () => {
  const { play, isReady } = useSpatialAudioEngine({
    soundConfigs: SOUND_CONFIGS,
    resolveBuffer: resolveGameSoundBuffer,
    volumeStore: useAudioStore,
    onLoadError: (event, url, error) => {
      console.warn(`Failed to load audio for ${event} (${url}):`, error);
    },
  });

  useEffect(() => {
    const unsubscribers = Object.values(GameEvent).map((event) =>
      gameEvents.on<AudioEventData<GameEvent>>(event, (data) => {
        void play(event, mapEventToPlayPayload(event, data));
      })
    );

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [play]);

  return {
    playSound: play,
    isReady,
  };
};
