import { FC, useMemo, useState } from "react";
import { Shield, Wind, Zap, Heart, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { EnemyUpgradeId } from "../../core/types/game";
import {
  enemyUpgradesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  levelEnemyUpgradeStackSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import {
  getStackTierForEnemy,
  getTierRoman,
  getTotalRewardBonusPercentForStack,
  getUniqueUpgradeIdsInStackOrder,
} from "../../utils/enemyUpgradeTierEffects";
import { UIButton } from "@/components/ui/buttons/UIButton";
import { UIModal } from "../ui/UIModal";
import { UITypography } from "../ui/UITypography";

type UpgradeIconProps = {
  upgradeId: EnemyUpgradeId;
  className?: string;
  size: number;
};

const UpgradeIcon: FC<UpgradeIconProps> = ({ upgradeId, className, size }) => {
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

const getTierColor = (tier: 1 | 2 | 3): string => {
  switch (tier) {
    case 1:
      return "text-amber-600";
    case 2:
      return "text-slate-400";
    case 3:
      return "text-yellow-400";
  }
};

type HUDEnemyUpgradesProps = {
  isMobile?: boolean;
};

export const HUDEnemyUpgrades: FC<HUDEnemyUpgradesProps> = ({
  isMobile = false,
}) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const enemyUpgrades = useGameStore(enemyUpgradesSelector);
  const levelEnemyUpgradeStack = useUpgradeStore(
    levelEnemyUpgradeStackSelector
  );

  const upgradeEntries = useMemo(() => {
    if (!enemyUpgrades) return [];
    return getUniqueUpgradeIdsInStackOrder(levelEnemyUpgradeStack)
      .map((upgradeId) => ({
        upgrade: enemyUpgrades[upgradeId],
        stackTier: getStackTierForEnemy(upgradeId, levelEnemyUpgradeStack),
      }))
      .filter((entry) => entry.upgrade !== undefined);
  }, [enemyUpgrades, levelEnemyUpgradeStack]);

  if (upgradeEntries.length === 0) {
    return null;
  }

  const totalBonusPercentage = upgradeEntries.reduce(
    (sum, { upgrade, stackTier }) =>
      sum + getTotalRewardBonusPercentForStack(upgrade, stackTier),
    0
  );

  return (
    <>
      <UIButton
        data-testid="upgrades-button"
        onClick={() => setIsOpen(true)}
        variant="outline"
        size={isMobile ? "xs" : "sm"}
        className="w-full justify-center gap-1.5"
      >
        <Zap className="text-yellow-400 shrink-0" size={isMobile ? 12 : 14} />
        {t("upgrade.selected")}
        {totalBonusPercentage > 0 && (
          <span className="text-green-400 font-semibold">
            +{totalBonusPercentage}%
          </span>
        )}
      </UIButton>

      <UIModal
        open={isOpen}
        title={t("upgrade.viewTitle")}
        icon={<Zap className="size-4 text-yellow-400" />}
        onOpenChange={setIsOpen}
        footer={
          <UIButton variant="secondary" onClick={() => setIsOpen(false)}>
            {t("common.gotIt")}
          </UIButton>
        }
      >
        <div className="flex flex-col gap-2">
          {upgradeEntries.map(({ upgrade, stackTier }) => (
            <div
              key={upgrade.id}
              className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-2.5 py-2"
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
              <UITypography
                variant="verySmall"
                className="text-muted-foreground"
              >
                {t("upgrade.bonusGold", {
                  percent: getTotalRewardBonusPercentForStack(
                    upgrade,
                    stackTier
                  ),
                })}
              </UITypography>
            </div>
          ))}
        </div>
      </UIModal>
    </>
  );
};
