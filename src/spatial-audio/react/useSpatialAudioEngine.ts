import { useCallback, useEffect, useRef } from "react";

import { setAudioContext } from "../context/audioContextRegistry";
import { SpatialAudioEngine } from "../core/spatialAudioEngine";
import type { SpatialAudioEngineOptions, VolumeStoreApi } from "../types";

/**
 * Options for {@link useSpatialAudioEngine}.
 *
 * @typeParam TEvent - String-union (or string) sound / event identifiers.
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
type UseSpatialAudioEngineOptions<
  TEvent extends string,
  TCategory extends string = string,
> = {
  /** Map of event id → {@link SoundConfig} passed to the engine. */
  soundConfigs: SpatialAudioEngineOptions<TEvent, TCategory>["soundConfigs"];
  /** Buffer resolver used on each {@link SpatialAudioEngine.play} call. */
  resolveBuffer: SpatialAudioEngineOptions<TEvent, TCategory>["resolveBuffer"];
  /**
   * Volume store API (`getState` + `subscribe`).
   * Used internally for play-time gain and live updates on currently playing sounds.
   */
  volumeStore: VolumeStoreApi<TCategory>;
};

/**
 * Return value of {@link useSpatialAudioEngine}.
 *
 * @typeParam TEvent - String-union (or string) sound / event identifiers.
 */
type UseSpatialAudioEngineResult<TEvent extends string> = {
  /**
   * Plays a configured event through the live engine (no-op before activation / after unmount).
   *
   * @param event - Event id present in `soundConfigs`.
   * @param data - Optional payload for the resolver and spatial `worldPosition`.
   */
  play: (event: TEvent, data?: unknown) => Promise<void>;
  /**
   * `true` when the AudioContext exists and has been activated
   * (already running, or resumed after a user gesture).
   */
  isReady: boolean;
};

/**
 * Creates a browser {@link AudioContext}, preferring the standard constructor
 * and falling back to legacy `webkitAudioContext` when needed.
 *
 * @throws If neither constructor is available.
 */
const createBrowserAudioContext = (): AudioContext => {
  const AudioContextCtor =
    window.AudioContext ||
    ("webkitAudioContext" in window
      ? (window.webkitAudioContext as typeof AudioContext)
      : undefined);

  if (!AudioContextCtor) {
    throw new Error("Web Audio API is not supported in this browser");
  }

  return new AudioContextCtor();
};

/**
 * React lifecycle wrapper around {@link SpatialAudioEngine}.
 *
 * Creates and closes an {@link AudioContext}, registers it via
 * {@link setAudioContext} for listener sync, resumes on first user gesture when
 * suspended, and reapplies live volumes whenever {@link VolumeStoreApi} changes.
 *
 * @typeParam TEvent - String-union (or string) sound / event identifiers.
 * @typeParam TCategory - Consumer-defined volume category string union.
 * @param options - Engine wiring and volume store.
 * @returns Stable `play` callback and readiness flag.
 */
export const useSpatialAudioEngine = <
  TEvent extends string,
  TCategory extends string = string,
>({
  soundConfigs,
  resolveBuffer,
  volumeStore,
}: UseSpatialAudioEngineOptions<TEvent, TCategory>): UseSpatialAudioEngineResult<TEvent> => {
  const engineRef = useRef<SpatialAudioEngine<TEvent, TCategory> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isActivatedRef = useRef(false);
  const volumeStoreRef = useRef(volumeStore);
  volumeStoreRef.current = volumeStore;

  useEffect(() => {
    let audioContext: AudioContext;

    try {
      audioContext = createBrowserAudioContext();
    } catch (error) {
      console.error("Failed to initialize audio context:", error);
      return;
    }

    audioContextRef.current = audioContext;
    setAudioContext(audioContext);

    const engine = new SpatialAudioEngine(audioContext, {
      soundConfigs,
      resolveBuffer,
      getVolumeState: () => volumeStoreRef.current.getState(),
    });
    engineRef.current = engine;

    if (audioContext.state === "suspended") {
      const activateAudio = async () => {
        try {
          await audioContext.resume();
          isActivatedRef.current = true;
          engine.setActivated(true);
        } catch (error) {
          console.warn("Could not activate audio context:", error);
        }
      };

      const handleInteraction = () => {
        void activateAudio();
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
      engine.setActivated(true);
    }

    return () => {
      engine.dispose();
      engineRef.current = null;
      setAudioContext(null);
      audioContextRef.current = null;

      if (audioContext.state !== "closed") {
        audioContext.close().catch(console.error);
      }
    };
  }, [soundConfigs, resolveBuffer]);

  useEffect(() => {
    return volumeStore.subscribe(() => {
      engineRef.current?.applyLiveVolumes();
    });
  }, [volumeStore]);

  const play = useCallback(async (event: TEvent, data?: unknown) => {
    await engineRef.current?.play(event, data);
  }, []);

  return {
    play,
    isReady: isActivatedRef.current && audioContextRef.current !== null,
  };
};
