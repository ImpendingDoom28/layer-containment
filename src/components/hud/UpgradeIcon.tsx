import { FC } from "react";
import { Shield, Wind, Zap, Heart, Users, type LucideProps } from "lucide-react";

import type { EnemyUpgradeId } from "../../core/types/game";

type UpgradeIconProps = {
  upgradeId: EnemyUpgradeId;
  className?: string;
  size?: LucideProps["size"];
};

/**
 * Maps an enemy upgrade to its glyph. Shared by the upgrade choice panel,
 * the picked-upgrades strip, and the game stats modal so every surface shows
 * the same icon for the same upgrade.
 */
export const UpgradeIcon: FC<UpgradeIconProps> = ({
  upgradeId,
  className,
  size,
}) => {
  switch (upgradeId) {
    case "armored":
      return <Shield className={className} size={size} />;
    case "swift":
      return <Wind className={className} size={size} />;
    case "slowResistance":
      return <Zap className={className} size={size} />;
    case "regenerating":
      return <Heart className={className} size={size} />;
    case "reinforcements":
      return <Users className={className} size={size} />;
    default:
      return null;
  }
};
