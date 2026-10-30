import type { EnemyUpgradeStackTier } from "../../core/types/game";

/**
 * Color of a tier number in the upgrade UI (I/II/III). One source of truth for
 * every surface that renders a tier label — the choice panel, the picked-upgrades
 * strip, and the game stats modal.
 */
export const getTierColor = (tier: EnemyUpgradeStackTier): string => {
  switch (tier) {
    case 1:
      return "text-amber-600";
    case 2:
      return "text-slate-400";
    case 3:
      return "text-yellow-400";
  }
};
