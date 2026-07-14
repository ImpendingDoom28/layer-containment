/** Module-level cache of decoded buffers keyed by {@link loadAudioBuffer}'s `cacheKey`. */
const soundCache: Record<string, AudioBuffer> = {};

/**
 * Fetches, decodes, and caches an audio file as an {@link AudioBuffer}.
 *
 * On cache hit, returns the existing buffer without another network request.
 * On failure, logs and returns `null`.
 *
 * @param audioContext - Context used for `decodeAudioData`.
 * @param url - Absolute or relative URL of the audio asset.
 * @param cacheKey - Cache key (defaults to `url`; use a stable key when the same asset is aliased).
 * @returns Decoded buffer, or `null` if loading / decoding failed.
 */
export const loadAudioBuffer = async (
  audioContext: AudioContext,
  url: string,
  cacheKey: string = url
): Promise<AudioBuffer | null> => {
  if (soundCache[cacheKey]) {
    return soundCache[cacheKey];
  }

  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    soundCache[cacheKey] = decoded;
    return decoded;
  } catch (error) {
    console.error(`Failed to load audio buffer from ${url}:`, error);
    return null;
  }
};

/**
 * Clears the module-level decoded-buffer cache.
 * Call when unloading a pack of assets or during tests.
 */
export const clearAudioBufferCache = () => {
  for (const key of Object.keys(soundCache)) {
    delete soundCache[key];
  }
};
