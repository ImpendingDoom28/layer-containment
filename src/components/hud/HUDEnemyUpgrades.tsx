import { FC, useMemo, useState } from "react";
import { Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  getTotalRewardMultiplierFromStack,
  getUniqueUpgradeIdsInStackOrder,
} from "../../utils/enemyUpgradeTierEffects";
import { UIButton } from "@/components/ui/buttons/UIButton";
import { UIModal } from "../ui/UIModal";
import { EnemyUpgradeRow } from "./EnemyUpgradeRow";

export const HUDEnemyUpgrades: FC = () => {
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

  // Gold multipliers stack multiplicatively per pick, so the button total
  // must be the combined multiplier — not a sum of the per-upgrade percents.
  const totalBonusPercentage = useMemo(() => {
    const multiplier = getTotalRewardMultiplierFromStack(
      levelEnemyUpgradeStack,
      enemyUpgrades
    );
    return Math.round((multiplier - 1) * 100);
  }, [levelEnemyUpgradeStack, enemyUpgrades]);

  if (upgradeEntries.length === 0) {
    return null;
  }

  return (
    <>
      <UIButton
        data-testid="upgrades-button"
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="sm"
      >
        <Zap className="text-yellow-400 shrink-0" />
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
            <EnemyUpgradeRow
              key={upgrade.id}
              upgrade={upgrade}
              stackTier={stackTier}
            />
          ))}
        </div>
      </UIModal>
    </>
  );
};
