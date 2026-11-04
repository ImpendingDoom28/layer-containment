import { FC } from "react";
import { useTranslation } from "react-i18next";

import type {
  EnemyUpgradeConfig,
  EnemyUpgradeStackTier,
} from "../../core/types/game";
import {
  getTierRoman,
  getTotalRewardBonusPercentForStack,
} from "../../utils/enemyUpgradeTierEffects";
import { cn } from "../ui/lib/twUtils";
import { UITypography } from "../ui/UITypography";
import { UpgradeIcon } from "./UpgradeIcon";
import { getTierColor } from "./upgradeTierColors";

type EnemyUpgradeRowProps = {
  upgrade: EnemyUpgradeConfig;
  stackTier: EnemyUpgradeStackTier;
  className?: string;
};

/**
 * A single picked-upgrade entry: glyph, name with its tier, and the stacked
 * gold bonus. Shared by the "Selected upgrades" strip in the choice panel and
 * the list in the game stats modal so both read identically.
 */
export const EnemyUpgradeRow: FC<EnemyUpgradeRowProps> = ({
  upgrade,
  stackTier,
  className,
}) => {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-2.5 py-2",
        className
      )}
    >
      <UpgradeIcon
        upgradeId={upgrade.id}
        className="text-muted-foreground shrink-0"
        size={16}
      />
      <UITypography variant="small" className="font-medium flex-1">
        {t(`enemyUpgrades.${upgrade.id}.name`)}
        <span className={getTierColor(stackTier)}>
          {" "}
          {getTierRoman(stackTier)}
        </span>
      </UITypography>
      <UITypography variant="verySmall" className="text-muted-foreground">
        {t("upgrade.bonusGold", {
          percent: getTotalRewardBonusPercentForStack(upgrade, stackTier),
        })}
      </UITypography>
    </div>
  );
};
