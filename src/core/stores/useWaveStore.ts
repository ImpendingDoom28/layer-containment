import { create } from "zustand";

type WaveStore = {
  nextWaveReady: boolean;
  setNextWaveReady: (ready: boolean) => void;
  /**
   * Whether the level's comet reveal has settled on the ground (the portals
   * have finished rising out of the scorch). Wave 1 is only offered and can
   * only start once this is true; `nextWaveReady` is deliberately left
   * independent of it so the "waiting for the next wave" pause-blocking
   * behaviour is unchanged while the comet is still in flight.
   */
  revealSettled: boolean;
  setRevealSettled: (settled: boolean) => void;
  /**
   * Bumped the instant a wave's field clears (the last enemy is gone). The
   * simulation clock's slow-mo beat listens for this: it eases the whole
   * world into a brief time dilation so the wave's end lands with a beat
   * before the upgrade gate opens.
   */
  waveClearedPulse: number;
  bumpWaveClearedPulse: () => void;
};

export const useWaveStore = create<WaveStore>((set) => ({
  nextWaveReady: true,
  setNextWaveReady: (ready) => {
    set({ nextWaveReady: ready });
  },
  revealSettled: true,
  setRevealSettled: (settled) => {
    set({ revealSettled: settled });
  },
  waveClearedPulse: 0,
  bumpWaveClearedPulse: () =>
    set((state) => ({ waveClearedPulse: state.waveClearedPulse + 1 })),
}));

export const nextWaveReadySelector = (state: WaveStore) => state.nextWaveReady;
export const setNextWaveReadySelector = (state: WaveStore) =>
  state.setNextWaveReady;
export const revealSettledSelector = (state: WaveStore) => state.revealSettled;
export const setRevealSettledSelector = (state: WaveStore) =>
  state.setRevealSettled;
