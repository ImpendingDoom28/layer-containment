import type {
  SoundConfig,
  SpatialAudioEngineOptions,
  VolumeState,
  WorldPosition,
} from "../types";
import { getCategoryVolume, MAX_VOLUME, toVolumeState } from "./volume";

/** Default half-range for randomized playback rate when config omits `pitchSpread`. */
const DEFAULT_PITCH_SPREAD = 0.05;

/** Panner `refDistance` — distance at which attenuation begins (world units). */
const SPATIAL_REF_DISTANCE = 4;

/** Panner `maxDistance` — distance beyond which attenuation no longer increases. */
const SPATIAL_MAX_DISTANCE = 90;

/** Panner `rolloffFactor` for the exponential distance model. */
const SPATIAL_ROLLOFF = 1.85;

/**
 * Returns a random playback rate centered on `1` within `±spread`.
 *
 * @param spread - Half-range around 1.0 (e.g. `0.05` → ~0.95–1.05).
 */
const getRandomPlaybackRate = (spread: number) =>
  1 + (Math.random() * 2 - 1) * spread;

/**
 * Extracts a `{ x, y, z }` `worldPosition` from an arbitrary play payload, if present.
 *
 * @param data - Optional payload passed to {@link SpatialAudioEngine.play}.
 * @returns Valid world position, or `null` when missing / malformed.
 */
const getWorldPositionFromPayload = (data: unknown): WorldPosition | null => {
  if (!data || typeof data !== "object" || !("worldPosition" in data)) {
    return null;
  }
  const wp = (data as { worldPosition?: WorldPosition }).worldPosition;
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

/**
 * Bookkeeping for a currently audible buffer source.
 *
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
type PlayingSound<TCategory extends string> = {
  /** Active buffer source node. */
  source: AudioBufferSourceNode;
  /** Gain node used for live volume updates. */
  gainNode: GainNode;
  /** Optional HRTF panner when the sound is spatialized. */
  panner?: PannerNode;
  /** Category used when recomputing gain from {@link VolumeState}. */
  category: TCategory;
  /** Normalized base volume from config (`0`–`1`) before category multipliers. */
  baseVolume: number;
};

/**
 * Headless Web Audio playback engine with optional HRTF spatialization.
 *
 * Framework-agnostic: create an {@link AudioContext}, pass event configs and a buffer
 * resolver, then call {@link play}. Activate via {@link setActivated} after a user gesture
 * when the context starts suspended.
 *
 * @typeParam TEvent - String-union (or string) sound / event identifiers.
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
export class SpatialAudioEngine<
  TEvent extends string,
  TCategory extends string = string,
> {
  /** Shared Web Audio context used for all nodes owned by this engine. */
  private readonly audioContext: AudioContext;
  /** Event id → playback configuration. */
  private readonly soundConfigs: Record<TEvent, SoundConfig<TCategory>>;
  /** Async buffer factory for each play request. */
  private readonly resolveBuffer: SpatialAudioEngineOptions<
    TEvent,
    TCategory
  >["resolveBuffer"];
  /** Latest volume snapshot provider (may be replaced via {@link updateVolumeState}). */
  private getVolumeState: () => VolumeState<TCategory>;
  /** Active one-shots / loops keyed by internal sound id. */
  private readonly playingSounds = new Map<number, PlayingSound<TCategory>>();
  /** Monotonic id counter for {@link playingSounds}. */
  private soundIdCounter = 0;
  /** Whether playback is allowed (usually after user-gesture context resume). */
  private activated = false;
  /** Whether {@link dispose} has run; further {@link play} calls are no-ops. */
  private disposed = false;

  /**
   * @param audioContext - Browser AudioContext (or webkit fallback instance).
   * @param options - Sound configs, buffer resolver, and volume provider.
   */
  constructor(
    audioContext: AudioContext,
    options: SpatialAudioEngineOptions<TEvent, TCategory>
  ) {
    this.audioContext = audioContext;
    this.soundConfigs = options.soundConfigs;
    this.resolveBuffer = options.resolveBuffer;
    this.getVolumeState = options.getVolumeState;
  }

  /**
   * Enables or disables playback (e.g. after `audioContext.resume()`).
   *
   * @param activated - When `false`, {@link play} returns immediately.
   */
  setActivated = (activated: boolean) => {
    this.activated = activated;
  };

  /** Whether the engine currently allows playback. */
  get isActivated() {
    return this.activated;
  }

  /**
   * Replaces the volume provider and immediately recomputes gains on active sounds.
   *
   * @param getVolumeState - Function that returns the latest {@link VolumeState}.
   */
  updateVolumeState = (getVolumeState: () => VolumeState<TCategory>) => {
    this.getVolumeState = getVolumeState;
    this.applyLiveVolumes();
  };

  /**
   * Resolves a buffer for `event` and starts playback (spatial when possible).
   *
   * Spatial path requires `config.spatial !== false` and a `worldPosition` on `data`.
   * Otherwise the sound plays non-spatially (with a console warning if spatial was expected).
   *
   * @param event - Configured sound / event id.
   * @param data - Optional payload for the buffer resolver and world-position extraction.
   */
  play = async (event: TEvent, data?: unknown): Promise<void> => {
    if (this.disposed || !this.activated) {
      return;
    }

    if (toVolumeState(this.getVolumeState()).muted) {
      return;
    }

    const config = this.soundConfigs[event];
    if (!config) {
      console.warn(`No sound config for event: ${event}`);
      return;
    }

    let buffer: AudioBuffer | null;
    try {
      buffer = await this.resolveBuffer(this.audioContext, event, data);
    } catch (error) {
      console.error(`Failed to create sound buffer for ${event}:`, error);
      return;
    }
    if (!buffer || this.disposed) {
      return;
    }

    if (toVolumeState(this.getVolumeState()).muted) {
      return;
    }

    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;

      if (!config.loop && config.pitchVariation !== false) {
        const spread = config.pitchSpread ?? DEFAULT_PITCH_SPREAD;
        source.playbackRate.value = getRandomPlaybackRate(spread);
      }

      const gainNode = this.audioContext.createGain();
      const baseVolume = (config.volume ?? MAX_VOLUME) / MAX_VOLUME;
      const categoryVolume = getCategoryVolume(
        toVolumeState(this.getVolumeState()),
        config.category
      );
      gainNode.gain.value = baseVolume * categoryVolume;

      const worldPos = getWorldPositionFromPayload(data);
      const useSpatial = config.spatial !== false && worldPos !== null;

      let panner: PannerNode | undefined;

      if (useSpatial && worldPos) {
        panner = this.audioContext.createPanner();
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
        panner.connect(this.audioContext.destination);
      } else {
        if (config.spatial !== false && !worldPos) {
          console.warn(
            `Spatial sound "${event}" missing worldPosition; playing non-spatial`
          );
        }
        source.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
      }

      if (config.loop) {
        source.loop = true;
      }

      const soundId = this.soundIdCounter++;
      this.playingSounds.set(soundId, {
        source,
        gainNode,
        panner,
        category: config.category,
        baseVolume,
      });

      source.onended = () => {
        this.playingSounds.delete(soundId);
        source.disconnect();
        gainNode.disconnect();
        panner?.disconnect();
      };

      source.start(0);
    } catch (error) {
      console.error(`Failed to play sound for ${event}:`, error);
    }
  };

  /**
   * Recomputes `GainNode` values for all currently playing sounds from the latest
   * {@link VolumeState} (master × category, or silence when muted).
   */
  applyLiveVolumes = () => {
    const volumeState = toVolumeState(this.getVolumeState());

    if (volumeState.muted) {
      this.stopAllPlayingSounds();
      return;
    }

    this.playingSounds.forEach((sound) => {
      const categoryVolume = getCategoryVolume(volumeState, sound.category);
      sound.gainNode.gain.value = sound.baseVolume * categoryVolume;
    });
  };

  private readonly stopAllPlayingSounds = () => {
    this.playingSounds.forEach((sound) => {
      try {
        sound.gainNode.gain.value = 0;
        sound.source.stop();
        sound.source.disconnect();
        sound.gainNode.disconnect();
        sound.panner?.disconnect();
      } catch {
        // Ignore errors during cleanup
      }
    });
    this.playingSounds.clear();
  };

  /**
   * Stops all playing sources, disconnects nodes, and prevents further playback.
   * Does not close the {@link AudioContext} — ownership remains with the caller.
   */
  dispose = () => {
    this.disposed = true;
    this.stopAllPlayingSounds();
  };
}
