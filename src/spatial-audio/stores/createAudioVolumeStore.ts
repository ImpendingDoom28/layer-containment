import { create } from "zustand";
import { persist } from "zustand/middleware";

import { MAX_VOLUME, MIN_VOLUME } from "../core/volume";
import type { VolumeState } from "../types";

/** Default volume when a category or master has no override. */
const DEFAULT_VOLUME = 50;

/**
 * Zustand store shape for category volumes, mute, and setters.
 * Extends {@link VolumeState} with mutation helpers (values clamped to {@link MIN_VOLUME}–{@link MAX_VOLUME}).
 *
 * @typeParam TCategory - Consumer-defined volume category string union.
 */
type AudioVolumeStore<TCategory extends string> = VolumeState<TCategory> & {
  /**
   * Sets the master volume (`0`–`100`, clamped).
   * @param volume - Desired master level.
   */
  setMasterVolume: (volume: number) => void;
  /**
   * Sets a category volume (`0`–`100`, clamped).
   * @param category - Category key from the configured tuple.
   * @param volume - Desired category level.
   */
  setCategoryVolume: (category: TCategory, volume: number) => void;
  /**
   * Forces muted / unmuted.
   * @param muted - `true` to silence all categories.
   */
  setMuted: (muted: boolean) => void;
  /** Toggles {@link VolumeState.muted}. */
  toggleMute: () => void;
};

/**
 * Options for {@link createAudioVolumeStore}.
 *
 * @typeParam TCategories - Readonly tuple of category name strings.
 */
type CreateAudioVolumeStoreOptions<TCategories extends readonly string[]> = {
  /**
   * `localStorage` key used by Zustand `persist`
   * (should be unique per app / game build).
   */
  persistKey: string;
  /**
   * Readonly category list (`as const`). Types for volumes and setters
   * are inferred from this tuple.
   */
  categories: TCategories;
  /**
   * Optional per-category default volumes.
   * Unspecified categories fall back to {@link DEFAULT_VOLUME}.
   */
  defaultCategoryVolumes?: Partial<Record<TCategories[number], number>>;
  /**
   * Optional initial master volume.
   * Falls back to {@link DEFAULT_VOLUME} when omitted.
   */
  defaultMasterVolume?: number;
};

/**
 * Clamps a volume to the inclusive {@link MIN_VOLUME}–{@link MAX_VOLUME} range.
 *
 * @param volume - Raw volume value from UI or persistence.
 */
const clampVolume = (volume: number) =>
  Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, volume));

/**
 * Builds the initial `categoryVolumes` map from the category tuple and overrides.
 */
const buildCategoryVolumes = <TCategories extends readonly string[]>(
  categories: TCategories,
  overrides?: Partial<Record<TCategories[number], number>>
): Record<TCategories[number], number> => {
  const volumes = {} as Record<TCategories[number], number>;

  for (const category of categories) {
    volumes[category as TCategories[number]] =
      overrides?.[category as TCategories[number]] ?? DEFAULT_VOLUME;
  }

  return volumes;
};

/**
 * True when persisted category keys match the configured category list
 * (same set of names, ignoring order).
 */
const categoriesMatch = (
  persisted: Record<string, number> | undefined,
  categories: readonly string[]
): boolean => {
  if (!persisted || typeof persisted !== "object") {
    return false;
  }

  const persistedKeys = Object.keys(persisted).sort();
  const configuredKeys = [...categories].sort();

  if (persistedKeys.length !== configuredKeys.length) {
    return false;
  }

  return persistedKeys.every((key, index) => key === configuredKeys[index]);
};

/**
 * Creates a persisted Zustand store for master / category volumes and mute.
 *
 * @param options - Persistence key, category tuple, and optional default volumes.
 * @returns A Zustand hook store typed to the category tuple, with `.categories` attached.
 */
export const createAudioVolumeStore = <
  TCategories extends readonly string[],
>({
  persistKey,
  categories,
  defaultCategoryVolumes,
  defaultMasterVolume = DEFAULT_VOLUME,
}: CreateAudioVolumeStoreOptions<TCategories>) => {
  type TCategory = TCategories[number];

  const initialCategoryVolumes = buildCategoryVolumes(
    categories,
    defaultCategoryVolumes
  );

  const store = create<AudioVolumeStore<TCategory>>()(
    persist(
      (set) => ({
        masterVolume: defaultMasterVolume,
        categoryVolumes: initialCategoryVolumes,
        muted: false,

        setMasterVolume: (volume: number) => {
          set({ masterVolume: clampVolume(volume) });
        },

        setCategoryVolume: (category: TCategory, volume: number) => {
          set((state) => ({
            categoryVolumes: {
              ...state.categoryVolumes,
              [category]: clampVolume(volume),
            },
          }));
        },

        setMuted: (muted: boolean) => {
          set({ muted });
        },

        toggleMute: () => {
          set((state) => ({ muted: !state.muted }));
        },
      }),
      {
        name: persistKey,
        partialize: (state) => ({
          masterVolume: state.masterVolume,
          categoryVolumes: state.categoryVolumes,
          muted: state.muted,
        }),
        merge: (persistedState, currentState) => {
          const persisted = persistedState as
            | Partial<AudioVolumeStore<TCategory>>
            | undefined;

          if (
            !persisted ||
            !categoriesMatch(persisted.categoryVolumes, categories)
          ) {
            return currentState;
          }

          return {
            ...currentState,
            ...persisted,
            categoryVolumes: {
              ...initialCategoryVolumes,
              ...persisted.categoryVolumes,
            },
          };
        },
      }
    )
  );

  return Object.assign(store, { categories });
};

export type { AudioVolumeStore };
