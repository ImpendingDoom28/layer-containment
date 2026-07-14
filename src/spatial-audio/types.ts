/**
 * XYZ position in world space, used for spatial sound placement and listener orientation.
 */
export type WorldPosition = {
  /** World-space X coordinate. */
  x: number;
  /** World-space Y coordinate. */
  y: number;
  /** World-space Z coordinate. */
  z: number;
};

/**
 * Per-event (or per-sound-id) playback configuration consumed by the spatial audio engine.
 *
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
export type SoundConfig<TCategory extends string = string> = {
  /** Volume channel this sound contributes to. */
  category: TCategory;
  /**
   * When `false`, the sound bypasses HRTF spatialization (UI / screen feedback).
   * Defaults to spatial when omitted and a `worldPosition` is present on the play payload.
   */
  spatial?: boolean;
  /**
   * Relative loudness within the category, typically `0`–`100`
   * (divided by `MAX_VOLUME` / 100 before applying category gain).
   */
  volume?: number;
  /** When `true`, the buffer source loops until stopped or the engine is disposed. */
  loop?: boolean;
  /** Planned fade-in duration in seconds (reserved for future use). */
  fadeIn?: number;
  /** Planned fade-out duration in seconds (reserved for future use). */
  fadeOut?: number;
  /**
   * Optional map of variant name → audio file URL.
   * Resolvers may pick a key from the play payload (e.g. tower type → shot sample).
   */
  srces?: Record<string, string>;
  /**
   * When `false`, playback rate stays `1`.
   * Ignored for looping sounds; defaults to enabled pitch variation when omitted.
   */
  pitchVariation?: boolean;
  /**
   * Half-range around `1.0` for randomized `playbackRate`
   * (e.g. `0.05` → about `0.95`–`1.05`).
   */
  pitchSpread?: number;
};

/**
 * Snapshot of user-facing volume controls used when computing effective gain.
 * Values are typically `0`–`100` except `muted`.
 *
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
export type VolumeState<TCategory extends string = string> = {
  /** Global multiplier applied on top of every category. */
  masterVolume: number;
  /** Per-category volume levels (`0`–`100`). */
  categoryVolumes: Record<TCategory, number>;
  /** When `true`, all category volumes resolve to silence. */
  muted: boolean;
};

/**
 * Minimal store surface the React hook needs to read volumes and react to changes.
 * Matches Zustand’s `getState` / `subscribe` (e.g. from {@link createAudioVolumeStore}).
 *
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
export type VolumeStoreApi<TCategory extends string = string> = {
  /** Returns the latest volume / mute snapshot. */
  getState: () => VolumeState<TCategory>;
  /**
   * Subscribes to store updates; return value unsubscribes.
   *
   * @param listener - Called after any store change (volumes, mute, etc.).
   */
  subscribe: (listener: () => void) => () => void;
};

/**
 * Construction options for a typed {@link SpatialAudioEngine}.
 *
 * @typeParam TEvent - String-union (or string) sound / event identifiers.
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
export type SpatialAudioEngineOptions<
  TEvent extends string,
  TCategory extends string = string,
> = {
  /** Map of every playable event id to its {@link SoundConfig}. */
  soundConfigs: Record<TEvent, SoundConfig<TCategory>>;
  /**
   * Resolves an {@link AudioBuffer} for a given event (file, procedural, or cached).
   * Return `null` to skip playback.
   *
   * @param ctx - Active Web Audio context used for decoding / synthesis.
   * @param event - Event id being played.
   * @param data - Optional caller payload (may include `worldPosition`, asset keys, etc.).
   */
  resolveBuffer: (
    ctx: AudioContext,
    event: TEvent,
    data?: unknown
  ) => Promise<AudioBuffer | null>;
  /**
   * Returns the latest volume / mute snapshot.
   * Called at play time and when live volumes are reapplied.
   */
  getVolumeState: () => VolumeState<TCategory>;
};

/**
 * Listener pose for Web Audio spatialization (position + orthonormal axes).
 */
export type ListenerOrientation = {
  /** Listener world position (usually camera / player). */
  position: WorldPosition;
  /** Unit vector the listener faces (camera look direction). */
  forward: WorldPosition;
  /** Unit vector pointing “up” for the listener. */
  up: WorldPosition;
};
