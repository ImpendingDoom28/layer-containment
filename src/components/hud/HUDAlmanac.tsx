import { FC, useMemo } from "react";
import { ArrowLeft, DollarSign, Gauge, HeartPulse, Skull } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "../ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";
import {
  UICard,
  UICardAction,
  UICardContent,
  UICardDescription,
  UICardHeader,
  UICardTitle,
} from "../ui/UICard";
import {
  useAlmanacStore,
  discoveredEnemiesSelector,
} from "../../core/stores/useAlmanacStore";
import {
  enemyTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import type { EnemyConfig, EnemyType } from "../../core/types/game";

type AlmanacEnemyCardProps = {
  enemyConfig: EnemyConfig;
  isDiscovered: boolean;
};

const AlmanacEnemyCard: FC<AlmanacEnemyCardProps> = ({
  enemyConfig,
  isDiscovered,
}) => {
  const { t } = useTranslation();
  return (
    <UICard
      className={`relative ${
        isDiscovered
          ? "ring-1 ring-primary/30"
          : "ring-1 ring-muted-foreground/20 italic"
      }`}
    >
      <UICardHeader className="py-0! border-b border-border relative">
        <UICardTitle
          className={`absolute top-1 left-4 gap-2 ${!isDiscovered ? "text-muted-foreground" : ""}`}
        >
          {/* Enemy color indicator / silhouette */}
          <div
            className={`relative flex items-center justify-center w-8 h-8 rounded-full ${!isDiscovered ? "bg-muted" : ""}`}
            style={{
              backgroundColor: isDiscovered ? enemyConfig.color : undefined,
              boxShadow: isDiscovered
                ? `0 0 12px ${enemyConfig.color}40`
                : undefined,
            }}
          >
            {!isDiscovered && (
              <span className="text-xs not-italic font-bold text-muted-foreground">
                ?
              </span>
            )}
          </div>
          <UITypography variant="medium">
            {isDiscovered
              ? t(`enemies.${enemyConfig.id}.name`)
              : t("almanac.undiscoveredName")}
          </UITypography>
        </UICardTitle>
        <UICardAction>
          {/* Discovery status badge */}
          <div
            className={`mt-2 px-2 py-0.5 text-xs rounded-t-xs ${
              isDiscovered
                ? "bg-green-500/20 text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isDiscovered ? t("almanac.discovered") : t("almanac.unknown")}
          </div>
        </UICardAction>
      </UICardHeader>

      <UICardContent>
        {isDiscovered ? (
          <>
            {enemyConfig.description && (
              <UICardDescription>
                {t(`enemies.${enemyConfig.id}.description`)}
              </UICardDescription>
            )}
            <div className="grid grid-cols-2 gap-0.5 mt-2">
              <div className="flex items-center gap-1">
                <HeartPulse size={12} className="text-red-400" />
                <UITypography variant="small" className="text-muted-foreground">
                  {t("almanac.health")}:
                </UITypography>
                <UITypography variant="small">
                  {enemyConfig.health}
                </UITypography>
              </div>
              <div className="flex items-center gap-1">
                <Gauge size={12} className="text-orange-400" />
                <UITypography variant="small" className="text-muted-foreground">
                  {t("almanac.speed")}:
                </UITypography>
                <UITypography variant="small">
                  {enemyConfig.speed.toFixed(1)}
                </UITypography>
              </div>
              <div className="flex items-center gap-1">
                <DollarSign size={12} className="text-green-400" />
                <UITypography variant="small" className="text-muted-foreground">
                  {t("almanac.reward")}:
                </UITypography>
                <UITypography variant="small">
                  {enemyConfig.reward}
                </UITypography>
              </div>
              <div className="flex items-center gap-1">
                <Skull size={12} className="text-white-400" />
                <UITypography variant="small" className="text-muted-foreground">
                  {t("almanac.damage")}:
                </UITypography>
                <UITypography variant="small">
                  {enemyConfig.healthLoss}
                </UITypography>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-4 text-center">
            <div className="mb-2 text-2xl opacity-30">👁️‍🗨️</div>
            <UITypography
              variant="small"
              className="italic text-muted-foreground"
            >
              {t("almanac.undiscovered")}
            </UITypography>
          </div>
        )}
      </UICardContent>
    </UICard>
  );
};

type HUDAlmanacProps = {
  onBack: () => void;
};

export const HUDAlmanac: FC<HUDAlmanacProps> = ({ onBack }) => {
  const { t } = useTranslation();
  const enemyTypes = useGameStore(enemyTypesSelector);
  const discoveredEnemies = useAlmanacStore(discoveredEnemiesSelector);

  const enemyEntries = useMemo(() => {
    if (!enemyTypes) return [];
    return Object.entries(enemyTypes) as [EnemyType, EnemyConfig][];
  }, [enemyTypes]);

  const discoveryCount = discoveredEnemies.length;
  const totalCount = enemyEntries.length;

  return (
    <UICard className="h-full w-full bg-transparent">
      <UICardHeader>
        <UICardTitle>
          <UIButton onClick={onBack} variant="ghost" size="icon">
            <ArrowLeft />
          </UIButton>
          <UITypography variant="h4">{t("almanac.title")}</UITypography>
        </UICardTitle>
        <UICardDescription>
          {t("almanac.description")}
        </UICardDescription>
      </UICardHeader>
      <UICardContent className="min-h-0 flex-1 gap-4 overflow-y-auto">
        {/* Progress bar */}
        <div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full transition-all duration-500 bg-primary"
              style={{
                width: `${
                  totalCount > 0 ? (discoveryCount / totalCount) * 100 : 0
                }%`,
              }}
            />
          </div>
          <UITypography variant="small" className="w-full py-1 text-end">
            {t("almanac.discoveredCount", {
              found: discoveryCount,
              total: totalCount,
            })}
          </UITypography>
        </div>

        {/* Enemy Grid */}
        <div className="grid grid-cols-1 gap-4">
          {enemyEntries.map(([type, config]) => (
            <AlmanacEnemyCard
              key={type}
              enemyConfig={config}
              isDiscovered={discoveredEnemies.includes(type)}
            />
          ))}
        </div>

        {/* Empty state */}
        {enemyEntries.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
            <UITypography variant="body" className="text-muted-foreground">
              {t("almanac.noData")}
            </UITypography>
          </div>
        )}
      </UICardContent>
    </UICard>
  );
};
