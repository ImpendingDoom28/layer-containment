/** Module singleton so R3F / non-React code can reach the active {@link AudioContext}. */
let audioContext: AudioContext | null = null;

/**
 * Registers (or clears) the shared {@link AudioContext} used by listener sync and tooling.
 *
 * @param ctx - Live context from the React engine hook, or `null` on teardown.
 */
export const setAudioContext = (ctx: AudioContext | null) => {
  audioContext = ctx;
};

/**
 * Returns the currently registered {@link AudioContext}, if any.
 *
 * @returns Shared context, or `null` before init / after dispose.
 */
export const getAudioContext = (): AudioContext | null => audioContext;
