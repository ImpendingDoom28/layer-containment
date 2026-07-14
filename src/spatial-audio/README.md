# Spatial Audio

A small, typed Web Audio layer for games and 3D apps. Play sounds by event id, optionally spatialize them with HRTF when a world position is provided, and control loudness through master + category volumes that update live on playing sounds. The core engine is framework-agnostic; React and React Three Fiber helpers are included for typical setups.

## Quick start

### 1. Volume store

```ts
import { createAudioVolumeStore } from "./stores/createAudioVolumeStore";

const AUDIO_CATEGORIES = ["sfx", "music"] as const;

export const useAudioStore = createAudioVolumeStore({
  persistKey: "my-app-audio-settings",
  categories: AUDIO_CATEGORIES,
  defaultCategoryVolumes: { sfx: 50, music: 50 },
});
```

### 2. Sound configs

```ts
import type { SoundConfig } from "./types";

type SoundEvent = "explosion" | "ui_click";
type AudioCategory = (typeof AUDIO_CATEGORIES)[number];

export const SOUND_CONFIGS: Record<SoundEvent, SoundConfig<AudioCategory>> = {
  explosion: { category: "sfx", volume: 70 },
  ui_click: { category: "sfx", volume: 50, spatial: false },
};
```

### 3. Buffer resolver

```ts
import { loadAudioBuffer } from "./core/bufferLoader";
import { generatePlaceholderSound } from "./core/proceduralSounds";

const resolveBuffer = async (
  ctx: AudioContext,
  event: SoundEvent
): Promise<AudioBuffer | null> => {
  switch (event) {
    case "explosion":
      return (
        (await loadAudioBuffer(ctx, "assets/explosion.wav")) ??
        generatePlaceholderSound(ctx, "tone", 0.3, 200)
      );
    case "ui_click":
      return generatePlaceholderSound(ctx, "click", 0.05, 1000);
    default:
      return null;
  }
};
```

### 4. React hook

```tsx
import { useSpatialAudioEngine } from "./react/useSpatialAudioEngine";

const { play, isReady } = useSpatialAudioEngine({
  soundConfigs: SOUND_CONFIGS,
  resolveBuffer,
  volumeStore: useAudioStore,
});

// Spatial SFX at a world point
await play("explosion", { worldPosition: { x: 10, y: 0, z: 5 } });

// Non-spatial UI sound
await play("ui_click");
```

The hook creates an `AudioContext`, resumes it on the first user click / keydown / touch, and reapplies volumes whenever the store changes. `isReady` is `true` once the context is activated.

### 5. R3F listener (for spatial sounds)

Mount inside your `<Canvas>` so panners hear from the camera's point of view:

```tsx
import { AudioListenerSync } from "./r3f/AudioListenerSync";

<Canvas>
  <AudioListenerSync />
  {/* scene … */}
</Canvas>;
```

## Key behaviors

- **Spatial vs non-spatial** — A sound is spatial when `config.spatial !== false` and `data.worldPosition` is present. Otherwise it plays flat (a warning is logged if spatial was expected but position is missing).
- **Live volume** — Changing master, category, or mute in the store updates gain on all currently playing sounds.
- **Pitch variation** — One-shots get a random `playbackRate` unless `pitchVariation: false` or `loop: true`.
- **Without React** — Instantiate `SpatialAudioEngine` directly, call `setActivated(true)` after a user gesture, and manage the `AudioContext` yourself.

## Full example in this repo

See [`src/game/audio/`](../game/audio/) for a complete integration: `SOUND_CONFIGS`, `resolveGameSoundBuffer`, and `useGameAudioSystem`.
