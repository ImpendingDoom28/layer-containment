import { create } from "zustand";

type WaveStore = {
  nextWaveReady: boolean;
  setNextWaveReady: (ready: boolean) => void;
};

export const useWaveStore = create<WaveStore>((set) => ({
  nextWaveReady: true,
  setNextWaveReady: (ready) => {
    set({ nextWaveReady: ready });
  },
}));

export const nextWaveReadySelector = (state: WaveStore) => state.nextWaveReady;
