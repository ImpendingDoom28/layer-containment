/**
 * Built-in synthetic sound shapes for placeholder / fallback SFX.
 * - `tone` — decaying sine
 * - `noise` — decaying white noise
 * - `click` — short high transient
 * - `whoosh` — frequency sweep with envelope
 */
export type PlaceholderSoundType = "tone" | "noise" | "click" | "whoosh";

/**
 * Synthesizes a mono {@link AudioBuffer} with a simple procedural waveform.
 * Useful as a fallback when asset files are missing or during prototyping.
 *
 * @param audioContext - Context whose sample rate sizes the buffer.
 * @param type - Waveform family to generate.
 * @param duration - Buffer length in seconds (default `0.1`).
 * @param frequency - Base frequency in Hz for tone / whoosh (default `440`).
 * @returns A mono buffer ready for an {@link AudioBufferSourceNode}.
 */
export const generatePlaceholderSound = (
  audioContext: AudioContext,
  type: PlaceholderSoundType = "tone",
  duration: number = 0.1,
  frequency: number = 440
): AudioBuffer => {
  const sampleRate = audioContext.sampleRate;
  const frameCount = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);

  switch (type) {
    case "tone": {
      for (let i = 0; i < frameCount; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-t * 5);
        data[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      }
      break;
    }
    case "noise": {
      for (let i = 0; i < frameCount; i++) {
        const t = i / frameCount;
        const envelope = Math.exp(-t * 3);
        data[i] = (Math.random() * 2 - 1) * envelope * 0.2;
      }
      break;
    }
    case "click": {
      for (let i = 0; i < frameCount; i++) {
        const t = i / frameCount;
        const envelope = Math.exp(-t * 20);
        data[i] = Math.sin(2 * Math.PI * 800 * t) * envelope * 0.1;
      }
      break;
    }
    case "whoosh": {
      for (let i = 0; i < frameCount; i++) {
        const t = i / frameCount;
        const envelope = Math.exp(-t * 2);
        const freq = frequency + (frequency * 2 - frequency) * t;
        data[i] = Math.sin(2 * Math.PI * freq * t) * envelope * 0.2;
      }
      break;
    }
  }

  return buffer;
};
