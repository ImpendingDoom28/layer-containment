import { useEffect } from "react";

import { useSpatialAudioEngine } from "../../spatial-audio/react/useSpatialAudioEngine";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../../core/types/enums/events";

import { type AudioEventData, SOUND_CONFIGS } from "./gameSoundConfig";
import { resolveGameSoundBuffer } from "./gameSoundResolver";
import { useAudioStore } from "./useAudioStore";

export const useGameAudioSystem = () => {
  const { play, isReady } = useSpatialAudioEngine({
    soundConfigs: SOUND_CONFIGS,
    resolveBuffer: resolveGameSoundBuffer,
    volumeStore: useAudioStore,
  });

  useEffect(() => {
    const unsubscribers = Object.values(GameEvent).map((event) =>
      gameEvents.on<AudioEventData<GameEvent>>(event, (data) => {
        void play(event, data);
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
