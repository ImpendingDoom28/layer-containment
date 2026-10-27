import {
  FC,
  useEffect,
  useMemo,
  useState,
  type AnimationEvent,
} from "react";
import { Zap, Shield, Wind, Heart, type LucideProps } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { EnemyUpgradeId } from "../../core/types/game";
import { UIButton } from "@/components/ui/buttons/UIButton";
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
  pendingEnemyUpgradeGateSelector,
  upgradeChoiceOptionsSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import {
  formatTotalUpgradeSummary,
  getPickTierForUpgrade,
  getStackTierForEnemy,
  getTierRewardBonusPercent,
  getTierRoman,
  getTotalRewardBonusPercentForStack,
  getTotalRewardMultiplierFromStack,
  getUniqueUpgradeIdsInStackOrder,
} from "../../utils/enemyUpgradeTierEffects";
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
    case "slowResistance":
      return <Zap className={className} size={size} />;
    case "regenerating":
      return <Heart className={className} size={size} />;
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

type HUDUpgradePanelProps = {
  onEnemyUpgradePick: (id: EnemyUpgradeId) => void;
};

export const HUDUpgradePanel: FC<HUDUpgradePanelProps> = ({
  onEnemyUpgradePick,
}) => {
  const { t } = useTranslation();
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);
  const levelEnemyUpgradeStack = useUpgradeStore(
    levelEnemyUpgradeStackSelector
  );
  const upgradeChoiceOptions = useUpgradeStore(upgradeChoiceOptionsSelector);
  const isOpen = useUpgradeStore(pendingEnemyUpgradeGateSelector);

  // Keep the panel mounted through its exit animation: `hasOpened` stays true
  // while the card slides out, then everything resets and the panel unmounts.
  const [hasOpened, setHasOpened] = useState(false);
  const [closing, setClosing] = useState(false);
  // Confirmed picks clear the choice list; remember the last set so the
  // cards stay visible while the panel animates out.
  const [frozenChoices, setFrozenChoices] = useState<EnemyUpgradeId[]>([]);

  useEffect(() => {
    if (isOpen) {
      setHasOpened(true);
      setClosing(false);
      setFrozenChoices(upgradeChoiceOptions);
    } else if (hasOpened) {
      setClosing(true);
    }
  }, [isOpen, hasOpened, upgradeChoiceOptions]);

  const displayChoices = isOpen ? upgradeChoiceOptions : frozenChoices;

  const handleCardAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    // Only the card's own exit animation unmounts the panel (child animations
    // bubble up, so check the target).
    if (event.target === event.currentTarget && event.animationName === "exit") {
      setHasOpened(false);
      setClosing(false);
    }
  };

  const totalRewardMultiplier = useMemo(() => {
    return getTotalRewardMultiplierFromStack(
      levelEnemyUpgradeStack,
      enemyUpgrades
    );
  }, [levelEnemyUpgradeStack, enemyUpgrades]);

  const bonusPercentage = useMemo(() => {
    return Math.round((totalRewardMultiplier - 1) * 100);
  }, [totalRewardMultiplier]);

  if (!hasOpened || !enemyUpgrades) {
    return null;
  }

  const onPickUpgrade = (id: EnemyUpgradeId) => {
    onEnemyUpgradePick(id);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-(--z-modal) flex items-center justify-center p-4",
        closing ? "pointer-events-none" : "pointer-events-auto"
      )}
      data-game-camera-block
    >
      {/* Backdrop mirrors the game's BlurBackdrop treatment: a full-screen
          backdrop blur plus a dark gradient vignette, so the centered card
          reads as a consistent game menu surface. */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          closing
            ? "animate-out fade-out duration-200 ease-in"
            : "animate-in fade-in duration-300 ease-out"
        )}
      >
        <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/50" />
      </div>

      <UICard
        className={cn(
          "relative z-10 w-full max-w-3xl max-h-[90vh] overflow-y-auto",
          closing
            ? "animate-out fade-out slide-out-to-bottom-10 duration-200 ease-in"
            : "animate-in fade-in slide-in-from-bottom-10 zoom-in-95 duration-300 ease-out"
        )}
        onAnimationEnd={handleCardAnimationEnd}
      >
        <UICardHeader>
          <UICardTitle className="flex flex-row items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400 shrink-0" />
            <UITypography variant="medium">{t("upgrade.title")}</UITypography>
          </UICardTitle>
          {bonusPercentage > 0 && (
            <UITypography
              variant="small"
              className="text-green-400 font-semibold"
            >
              {t("upgrade.stackedBonus", { percent: bonusPercentage })}
            </UITypography>
          )}
        </UICardHeader>

        <UICardContent>
          <div className="flex flex-row flex-wrap gap-3 justify-center">
            {displayChoices.map((upgradeId) => {
              const upgrade = enemyUpgrades[upgradeId];
              if (!upgrade) return null;

              const nextStackTier = getPickTierForUpgrade(
                levelEnemyUpgradeStack,
                upgradeId
              );
              const tierSummary = formatTotalUpgradeSummary(
                upgrade,
                nextStackTier
              );
              const rewardBonus = getTierRewardBonusPercent(
                upgrade,
                nextStackTier
              );

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
                      {t(`enemyUpgrades.${upgradeId}.name`)}
                    </UITypography>
                    <UITypography
                      className={`font-bold shrink-0 ${getTierColor(nextStackTier)}`}
                      variant="medium"
                    >
                      {getTierRoman(nextStackTier)}
                    </UITypography>
                  </div>

                  {tierSummary !== "" && (
                    <UITypography
                      className="text-muted-foreground text-left"
                      variant="small"
                    >
                      {tierSummary}
                    </UITypography>
                  )}
                  <UITypography
                    className="mt-auto"
                    style={{ color: upgrade.indicatorColor }}
                    variant="small"
                  >
                    {t("upgrade.goldThisPick", { percent: rewardBonus })}
                  </UITypography>
                </UIButton>
              );
            })}
          </div>

          {levelEnemyUpgradeStack.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border/70">
              <UITypography
                variant="verySmall"
                className="text-muted-foreground uppercase tracking-[0.16em]"
              >
                {t("upgrade.selected")}
              </UITypography>
              <div className="mt-2 flex flex-row flex-wrap gap-2">
                {getUniqueUpgradeIdsInStackOrder(levelEnemyUpgradeStack).map(
                  (upgradeId) => {
                    const upgrade = enemyUpgrades[upgradeId];
                    if (!upgrade) return null;
                    const stackTier = getStackTierForEnemy(
                      upgradeId,
                      levelEnemyUpgradeStack
                    );
                    return (
                      <div
                        key={upgradeId}
                        className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/35 px-2 py-1.5"
                      >
                        <UpgradeIcon
                          upgradeId={upgradeId}
                          className="text-muted-foreground shrink-0"
                          size={14}
                        />
                        <UITypography
                          variant="small"
                          className="font-medium"
                        >
                          {t(`enemyUpgrades.${upgradeId}.name`)}{" "}
                          <span className={getTierColor(stackTier)}>
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
                    );
                  }
                )}
              </div>
            </div>
          )}
        </UICardContent>
      </UICard>
    </div>
  );
};
