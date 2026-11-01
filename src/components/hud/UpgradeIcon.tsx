import { FC } from "react";

import { Icon, type IconName } from "../ui/Icon";
import type { EnemyUpgradeId } from "../../core/types/game";

const UPGRADE_ICON_NAMES: Record<EnemyUpgradeId, IconName> = {
  armored: "Shield",
  swift: "Wind",
  slowResistance: "Zap",
  regenerating: "Heart",
  reinforcements: "Users",
};

type UpgradeIconProps = {
  upgradeId: EnemyUpgradeId;
  className?: string;
  size?: number;
};

/**
 * Maps an enemy upgrade to its glyph. Shared by the upgrade choice panel,
 * the picked-upgrades strip, and the game stats modal so every surface shows
 * the same icon for the same upgrade.
 *
 * Renders the muted (gray) variant — the color used by the upgrade rows and
 * the watermark. Callers that need another color (e.g. the white badge in the
 * almanac) use <Icon /> directly.
 */
export const UpgradeIcon: FC<UpgradeIconProps> = ({
  upgradeId,
  className,
  size,
}) => (
  <Icon
    name={UPGRADE_ICON_NAMES[upgradeId]}
    color="muted"
    size={size}
    className={className}
  />
);
