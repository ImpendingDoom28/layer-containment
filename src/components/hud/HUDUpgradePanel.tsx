import { FC, useMemo } from "react";
import { Zap, Shield, Wind, Heart, LucideProps } from "lucide-react";

import type { EnemyUpgradeId } from "../../core/types/game";
import { UIButton } from "@/components/ui/UIButton";
import {
  UICard,
  UICardContent,
  UICardHeader,
  UICardTitle,
} from "@/components/ui/UICard";
import { UITypography } from "../ui/UITypography";
import {
  enemyUpgradesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import {
  levelEnemyUpgradeStackSelector,
  upgradeChoiceOptionsSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import { cn } from "../ui/lib/twUtils";

type UpgradeIconProps = {
  upgradeId: EnemyUpgradeId;
  className?: string;
  size: LucideProps["size"];
};

const UpgradeIcon: FC<UpgradeIconProps> = ({ upgradeId, className, size }) => {
  switch (upgradeId) {
    case "armored":
      return <Shield className={className} size={size} />;
    case "swift":
      return <Wind className={className} size={size} />;
    case "slowImmune":
      return <Zap className={className} size={size} />;
    case "regenerating":
      return <Heart className={className} size={size} />;
    default:
      return null;
  }
};

const getTierLabel = (tier: 1 | 2 | 3): string => {
  switch (tier) {
    case 1:
      return "I";
    case 2:
      return "II";
    case 3:
      return "III";
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

type HUDUpgradePanelProps = {
  onEnemyUpgradePick: (id: EnemyUpgradeId) => void;
};

export const HUDUpgradePanel: FC<HUDUpgradePanelProps> = ({
  onEnemyUpgradePick,
}) => {
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);
  const levelEnemyUpgradeStack = useUpgradeStore(
    levelEnemyUpgradeStackSelector
  );
  const upgradeChoiceOptions = useUpgradeStore(upgradeChoiceOptionsSelector);

  const totalRewardMultiplier = useMemo(() => {
    if (!enemyUpgrades) return 1;
    return levelEnemyUpgradeStack.reduce((acc, upgradeId) => {
      const upgrade = enemyUpgrades[upgradeId];
      return acc * (upgrade?.rewardMultiplier ?? 1);
    }, 1);
  }, [levelEnemyUpgradeStack, enemyUpgrades]);

  const bonusPercentage = useMemo(() => {
    return Math.round((totalRewardMultiplier - 1) * 100);
  }, [totalRewardMultiplier]);

  if (!enemyUpgrades || upgradeChoiceOptions.length === 0) {
    return null;
  }

  const onPickUpgrade = (id: EnemyUpgradeId) => {
    onEnemyUpgradePick(id);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto p-4"
      data-game-camera-block
    >
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-xl"
        aria-hidden
      />
      <UICard className="relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <UICardHeader>
          <UICardTitle className="flex flex-row items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
            <UITypography variant="medium">Empower Next Wave</UITypography>
          </UICardTitle>
          {bonusPercentage > 0 && (
            <UITypography
              variant="small"
              className="text-green-400 font-semibold"
            >
              Stacked bonus: +{bonusPercentage}% gold
            </UITypography>
          )}
        </UICardHeader>

        <UICardContent>
          <div className="flex flex-row flex-wrap gap-3 justify-center">
            {upgradeChoiceOptions.map((upgradeId) => {
              const upgrade = enemyUpgrades[upgradeId];
              if (!upgrade) return null;

              return (
                <UIButton
                  key={upgradeId}
                  onClick={() => onPickUpgrade(upgradeId)}
                  variant="outline"
                  className={cn(
                    "relative flex flex-col items-start justify-start p-3 gap-1",
                    "min-h-32 w-36 sm:w-40"
                  )}
                >
                  <UpgradeIcon
                    upgradeId={upgradeId}
                    className="absolute inset-0 w-full! h-full! opacity-[0.025]"
                    size={16}
                  />
                  <div className="flex items-center justify-between w-full gap-1">
                    <UITypography variant="medium" className="font-semibold">
                      {upgrade.name}
                    </UITypography>
                    <UITypography
                      className={`font-bold shrink-0 ${getTierColor(upgrade.tier)}`}
                      variant="medium"
                    >
                      {getTierLabel(upgrade.tier)}
                    </UITypography>
                  </div>

                  <UITypography
                    className="text-muted-foreground text-left"
                    variant="small"
                  >
                    {upgrade.description}
                  </UITypography>
                  <UITypography
                    className="mt-auto"
                    style={{ color: upgrade.indicatorColor }}
                    variant="small"
                  >
                    +{Math.round((upgrade.rewardMultiplier - 1) * 100)}% gold
                  </UITypography>
                </UIButton>
              );
            })}
          </div>
        </UICardContent>
      </UICard>
    </div>
  );
};
