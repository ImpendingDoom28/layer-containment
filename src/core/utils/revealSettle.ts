import { PORTAL_REVEAL_DURATION_S } from "../../constants/cometReveal";
import { useLevelStore } from "../stores/useLevelStore";

// How long (simulation seconds) after the comet's impact the spawn portals
// are considered "still settling". The portal rises out of the scorch over
// `PORTAL_REVEAL_DURATION_S` (see `Portal.tsx`'s `ENTRY_DURATION`); the first
// wave and the main menu's ambient enemies must not start while that rise is
// in progress, so the gate holds for the full rise plus a small buffer before
// the first spawns are allowed.
const COMET_SETTLE_SECONDS = PORTAL_REVEAL_DURATION_S + 0.3;

/**
 * Whether the level's comet reveal has settled (the spawn portals have
 * finished rising onto the ground): `true` when there is no reveal at all, the
 * reveal belongs to an earlier run (a stale reveal from a previous level), or
 * the current run's reveal has been `revealed` for at least
 * `COMET_SETTLE_SECONDS` of simulation time. While the comet is still in
 * flight (`armed`) or the portals are still rising, it is not settled, so the
 * first wave and the main menu's ambient spawns must not start.
 *
 * Shared by the wave system (which holds wave 1) and the main menu scene (which
 * holds its ambient spawns) so both gate on the same notion of "the portals
 * have landed".
 */
export const isRevealSettled = (
  simulationTimeSeconds: number
): boolean => {
  const { cometReveal, levelEnterRun } = useLevelStore.getState();
  if (cometReveal === null) return true;
  if (cometReveal.run !== levelEnterRun) return true;
  if (cometReveal.phase === "armed") return false;
  const revealedAt = cometReveal.revealedAt;
  if (revealedAt === undefined) return false;
  return simulationTimeSeconds - revealedAt >= COMET_SETTLE_SECONDS;
};
