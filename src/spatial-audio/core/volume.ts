import type { VolumeState } from "../types";

/** Inclusive upper bound for UI / store volume values (`0`–`100` scale). */
export const MAX_VOLUME = 100;

/** Inclusive lower bound for UI / store volume values (`0`–`100` scale). */
export const MIN_VOLUME = 0;

/**
 * Extracts a {@link VolumeState} snapshot from a store or partial state object.
 *
 * @param state - Full store state or volume fields from {@link VolumeStoreApi.getState}.
 */
export const toVolumeState = <TCategory extends string>(
  state: VolumeState<TCategory> & Record<string, unknown>
): VolumeState<TCategory> => ({
  masterVolume: state.masterVolume,
  categoryVolumes: state.categoryVolumes,
  muted: state.muted === true,
});

/**
 * Computes the effective category gain multiplier from a {@link VolumeState}.
 *
 * Formula: `(masterVolume * categoryVolume) / (MAX_VOLUME * 10)` when not muted;
 * returns {@link MIN_VOLUME} when muted.
 *
 * @param state - Current master / category / mute snapshot.
 * @param category - Which category channel to read.
 * @returns Multiplier typically in about `0`–`1` range for gain nodes.
 */
export const getCategoryVolume = <TCategory extends string>(
  state: VolumeState<TCategory>,
  category: TCategory
): number => {
  if (state.muted) {
    return MIN_VOLUME;
  }

  const categoryVol = state.categoryVolumes[category];

  return (state.masterVolume * categoryVol) / (MAX_VOLUME * 10);
};
