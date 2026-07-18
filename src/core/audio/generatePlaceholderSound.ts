export type PlaceholderSoundType = "tone" | "noise" | "click" | "whoosh";

export const generatePlaceholderSound = (
  audioContext: AudioContext,
  type: PlaceholderSoundType = "tone",
  duration = 0.1,
  frequency = 440
): AudioBuffer => {
  const sampleRate = audioContext.sampleRate;
  const sampleCount = Math.floor(sampleRate * duration);
  const buffer = audioContext.createBuffer(1, sampleCount, sampleRate);
  const channelData = buffer.getChannelData(0);

  switch (type) {
    case "tone":
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleRate;
        const envelope = Math.exp(-5 * t);
        channelData[i] = Math.sin(2 * Math.PI * frequency * t) * envelope * 0.3;
      }
      break;
    case "noise":
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount;
        const envelope = Math.exp(-3 * t);
        channelData[i] = (2 * Math.random() - 1) * envelope * 0.2;
      }
      break;
    case "click":
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount;
        const envelope = Math.exp(-20 * t);
        channelData[i] = Math.sin(2 * Math.PI * 800 * t) * envelope * 0.1;
      }
      break;
    case "whoosh":
      for (let i = 0; i < sampleCount; i++) {
        const t = i / sampleCount;
        const envelope = Math.exp(-2 * t);
        const sweepFrequency = frequency + (2 * frequency - frequency) * t;
        channelData[i] =
          Math.sin(2 * Math.PI * sweepFrequency * t) * envelope * 0.2;
      }
      break;
  }

  return buffer;
};
