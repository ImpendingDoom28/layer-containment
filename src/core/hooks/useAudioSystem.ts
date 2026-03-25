import { useEffect, useRef, useCallback } from "react";
import { gameEvents } from "../../utils/eventEmitter";
import {
  AudioCategory,
  SOUND_CONFIGS,
  getPlaceholderSoundForEvent,
  AudioEventData,
} from "../audioConfig";
import { setGameAudioContext } from "../audio/gameAudioContext";
import { GameEvent } from "../types/enums/events";
import { MAX_VOLUME, MIN_VOLUME, useAudioStore } from "../stores/useAudioStore";

const DEFAULT_PITCH_SPREAD = 0.05;

const getRandomPlaybackRate = (spread: number) =>
  1 + (Math.random() * 2 - 1) * spread;

type SoundPool = {
  buffers: AudioBufferSourceNode[];
  maxSize: number;
};

type PlayingSound = {
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  panner?: PannerNode;
  category: AudioCategory;
  baseVolume: number;
};

const SPATIAL_REF_DISTANCE = 4;
const SPATIAL_MAX_DISTANCE = 90;
const SPATIAL_ROLLOFF = 1.85;

const getWorldPositionFromPayload = (
  data: unknown
): { x: number; y: number; z: number } | null => {
  if (!data || typeof data !== "object" || !("worldPosition" in data)) {
    return null;
  }
  const wp = (data as { worldPosition?: { x: number; y: number; z: number } })
    .worldPosition;
  if (
    !wp ||
    typeof wp.x !== "number" ||
    typeof wp.y !== "number" ||
    typeof wp.z !== "number"
  ) {
    return null;
  }
  return wp;
};

export const useAudioSystem = () => {
  const audioContextRef = useRef<AudioContext | null>(null);
  const soundPoolsRef = useRef<Map<GameEvent, SoundPool>>(new Map());
  const playingSoundsRef = useRef<Map<number, PlayingSound>>(new Map());
  const soundIdCounterRef = useRef<number>(0);
  const isActivatedRef = useRef<boolean>(false);

  const { masterVolume, sfxVolume, musicVolume, ambientVolume, muted } =
    useAudioStore();

  // Initialize audio context
  useEffect(() => {
    try {
      const audioContext = new (
        window.AudioContext ||
        // Fallback for Safari
        ("webkitAudioContext" in window && window.webkitAudioContext)
      )();
      audioContextRef.current = audioContext;
      setGameAudioContext(audioContext);

      // Try to resume context (some browsers require user interaction)
      if (audioContext.state === "suspended") {
        const activateAudio = async () => {
          try {
            await audioContext.resume();
            isActivatedRef.current = true;
          } catch (error) {
            console.warn("Could not activate audio context:", error);
          }
        };

        // Try to activate on first user interaction
        const handleInteraction = () => {
          activateAudio();
          document.removeEventListener("click", handleInteraction);
          document.removeEventListener("keydown", handleInteraction);
          document.removeEventListener("touchstart", handleInteraction);
        };

        document.addEventListener("click", handleInteraction, { once: true });
        document.addEventListener("keydown", handleInteraction, { once: true });
        document.addEventListener("touchstart", handleInteraction, {
          once: true,
        });
      } else {
        isActivatedRef.current = true;
      }

      return () => {
        // Cleanup: stop all sounds and close context
        playingSoundsRef.current.forEach((sound) => {
          try {
            sound.source.stop();
            sound.source.disconnect();
            sound.gainNode.disconnect();
            sound.panner?.disconnect();
          } catch (error) {
            // Ignore errors during cleanup
          }
        });
        playingSoundsRef.current.clear();
        soundPoolsRef.current.clear();
        setGameAudioContext(null);

        if (audioContext.state !== "closed") {
          audioContext.close().catch(console.error);
        }
      };
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
    }
  }, []);

  // // Get or create sound pool for an event
  // const getSoundPool = useCallback((event: AudioEvent): SoundPool => {
  //   if (!soundPoolsRef.current.has(event)) {
  //     soundPoolsRef.current.set(event, {
  //       buffers: [],
  //       maxSize:
  //         event === AudioEvent.TOWER_FIRE || event === AudioEvent.PROJECTILE_HIT
  //           ? 10
  //           : 3,
  //     });
  //   }
  //   return soundPoolsRef.current.get(event)!;
  // }, []);

  // Create audio buffer for an event
  const createSoundBuffer = useCallback(
    async <T extends AudioEventData<GameEvent>>(
      event: GameEvent,
      data?: T
    ): Promise<AudioBuffer | null> => {
      const audioContext = audioContextRef.current;
      if (!audioContext) return null;

      try {
        return await getPlaceholderSoundForEvent(audioContext, event, data);
      } catch (error) {
        console.error(`Failed to create sound buffer for ${event}:`, error);
        return null;
      }
    },
    []
  );

  // Get volume multiplier for a category
  const getCategoryVolume = useCallback(
    (category: AudioCategory): number => {
      if (muted) return MIN_VOLUME;

      let categoryVol = MAX_VOLUME;
      switch (category) {
        case "sfx":
          categoryVol = sfxVolume;
          break;
        case "music":
          categoryVol = musicVolume;
          break;
        case "ambient":
          categoryVol = ambientVolume;
          break;
      }

      return (masterVolume * categoryVol) / (MAX_VOLUME * 10);
    },
    [masterVolume, sfxVolume, musicVolume, ambientVolume, muted]
  );

  // Play a sound
  const playSound = useCallback(
    async <T extends AudioEventData<GameEvent>>(event: GameEvent, data?: T) => {
      const audioContext = audioContextRef.current;
      if (!audioContext || !isActivatedRef.current) return;

      const config = SOUND_CONFIGS[event];
      if (!config) {
        console.warn(`No sound config for event: ${event}`);
        return;
      }

      const buffer = await createSoundBuffer(event, data);
      if (!buffer) return;

      try {
        // Create source node
        const source = audioContext.createBufferSource();
        source.buffer = buffer;

        if (!config.loop && config.pitchVariation !== false) {
          const spread = config.pitchSpread ?? DEFAULT_PITCH_SPREAD;
          source.playbackRate.value = getRandomPlaybackRate(spread);
        }

        // Create gain node for volume control
        const gainNode = audioContext.createGain();
        const baseVolume = (config.volume ?? MAX_VOLUME) / MAX_VOLUME;
        const categoryVolume = getCategoryVolume(config.category);
        gainNode.gain.value = baseVolume * categoryVolume;

        const worldPos = getWorldPositionFromPayload(data);
        const useSpatial = config.spatial !== false && worldPos !== null;

        let panner: PannerNode | undefined;

        if (useSpatial && worldPos) {
          panner = audioContext.createPanner();
          panner.panningModel = "HRTF";
          panner.distanceModel = "exponential";
          panner.refDistance = SPATIAL_REF_DISTANCE;
          panner.maxDistance = SPATIAL_MAX_DISTANCE;
          panner.rolloffFactor = SPATIAL_ROLLOFF;
          panner.coneInnerAngle = 360;
          panner.positionX.value = worldPos.x;
          panner.positionY.value = worldPos.y;
          panner.positionZ.value = worldPos.z;

          source.connect(gainNode);
          gainNode.connect(panner);
          panner.connect(audioContext.destination);
        } else {
          if (config.spatial !== false && !worldPos) {
            console.warn(
              `Spatial sound "${event}" missing worldPosition; playing non-spatial`
            );
          }
          source.connect(gainNode);
          gainNode.connect(audioContext.destination);
        }

        // Handle loop
        if (config.loop) {
          source.loop = true;
        }

        // Store playing sound
        const soundId = soundIdCounterRef.current++;
        const playingSound: PlayingSound = {
          source,
          gainNode,
          panner,
          category: config.category,
          baseVolume: baseVolume,
        };
        playingSoundsRef.current.set(soundId, playingSound);

        // Clean up when sound ends
        source.onended = () => {
          playingSoundsRef.current.delete(soundId);
          source.disconnect();
          gainNode.disconnect();
          panner?.disconnect();
        };

        // Start playback
        source.start(0);
      } catch (error) {
        console.error(`Failed to play sound for ${event}:`, error);
      }
    },
    [createSoundBuffer, getCategoryVolume]
  );

  // Update volumes of currently playing sounds
  useEffect(() => {
    playingSoundsRef.current.forEach((sound) => {
      const categoryVolume = getCategoryVolume(sound.category);
      sound.gainNode.gain.value = sound.baseVolume * categoryVolume;
    });
  }, [
    masterVolume,
    sfxVolume,
    musicVolume,
    ambientVolume,
    muted,
    getCategoryVolume,
  ]);

  // Set up event listeners
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Subscribe to all audio events
    Object.values(GameEvent).forEach((event) => {
      const unsubscribe = gameEvents.on<AudioEventData<GameEvent>>(
        event,
        (data) => {
          playSound(event, data);
        }
      );
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [playSound]);

  // Expose manual play function for external use
  return {
    playSound,
    isReady: isActivatedRef.current && audioContextRef.current !== null,
  };
};
