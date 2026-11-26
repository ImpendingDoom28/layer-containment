/**
 * Dedicated performance stress-test entry (served via
 * `stress/index.stress.html` / `stress/vite.config.ts`).
 *
 * Thin wrapper around the shared stress scene in
 * `src/components/scenes/stress/` so the scene has exactly one implementation:
 * this entry (used by the profiling scripts and the `test:e2e:stress` suite)
 * and the main app's `/stress` route (hidden behind `?m=debug`) render the same
 * `StressLevelScene`. The entry provides the shared world the scene runs on.
 */
import { WorldProvider } from "koota/react";

import { EntityIdProvider } from "../../src/core/contexts/EntityIdContext";
import { world } from "../../src/core/ecs/world";
import { StressLevelScene } from "../../src/components/scenes/stress/StressLevelScene";

export const StressTestApp = () => (
  <WorldProvider world={world}>
    <EntityIdProvider>
      <StressLevelScene />
    </EntityIdProvider>
  </WorldProvider>
);
