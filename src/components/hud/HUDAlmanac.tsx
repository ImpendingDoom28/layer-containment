import { FC, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Crosshair,
  DollarSign,
  GitBranch,
  Gauge,
  Heart,
  HeartPulse,
  Radio,
  Radar,
  Skull,
  Snowflake,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "../ui/buttons/UIButton";
import { UITypography } from "../ui/UITypography";
import { UIMoney } from "../ui/UIMoney";
import { cn } from "../ui/lib/twUtils";
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
  enemyUpgradesSelector,
  towerTypesSelector,
  useGameStore,
} from "../../core/stores/useGameStore";
import type {
  EnemyConfig,
  EnemyType,
  EnemyUpgradeConfig,
  EnemyUpgradeId,
  TowerConfig,
  TowerType,
} from "../../core/types/game";

type AlmanacTab = "enemies" | "towers" | "upgrades";

type AlmanacTabButtonProps = {
  tab: AlmanacTab;
  label: string;
  icon: LucideIcon;
  active: boolean;
  onSelect: (tab: AlmanacTab) => void;
};

const AlmanacTabButton: FC<AlmanacTabButtonProps> = ({
  tab,
  label,
  icon: TabIcon,
  active,
  onSelect,
}) => (
  <UIButton
    onClick={() => onSelect(tab)}
    aria-pressed={active}
    variant={active ? "default" : "ghost"}
    className="flex-1 gap-1.5 text-xs uppercase tracking-wider"
  >
    <TabIcon size={14} className="shrink-0" />
    {label}
  </UIButton>
);

type AlmanacStatEntry = {
  label: string;
  value: ReactNode;
};

type AlmanacStatRowProps = {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  value: ReactNode;
};

const AlmanacStatRow: FC<AlmanacStatRowProps> = ({
  icon: StatIcon,
  iconClassName,
  label,
  value,
}) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <StatIcon size={12} className={cn("shrink-0", iconClassName)} />
    <UITypography
      variant="small"
      className="shrink-0 text-muted-foreground"
    >
      {label}:
    </UITypography>
    <UITypography
      variant="small"
      className="truncate"
      whiteSpace="nowrap"
      title={typeof value === "string" ? value : undefined}
    >
      {value}
    </UITypography>
  </div>
);

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
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
              <AlmanacStatRow
                icon={HeartPulse}
                iconClassName="text-red-400"
                label={t("almanac.health")}
                value={enemyConfig.health}
              />
              <AlmanacStatRow
                icon={Gauge}
                iconClassName="text-orange-400"
                label={t("almanac.speed")}
                value={enemyConfig.speed.toFixed(1)}
              />
              <AlmanacStatRow
                icon={Skull}
                iconClassName="text-red-300"
                label={t("almanac.baseDamage")}
                value={enemyConfig.healthLoss}
              />
              <AlmanacStatRow
                icon={DollarSign}
                iconClassName="text-green-400"
                label={t("almanac.reward")}
                value={enemyConfig.reward}
              />
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

const ALMANAC_TOWER_ICONS: Record<TowerType, LucideIcon> = {
  basic: Crosshair,
  slow: Snowflake,
  aoe: Waves,
  laser: Radar,
  relay: Radio,
  chain: Zap,
};

type TowerStatBuilder = (
  towerConfig: TowerConfig,
  t: ReturnType<typeof useTranslation>["t"]
) => AlmanacStatEntry[];

const getTowerStatEntries: TowerStatBuilder = (towerConfig, t) => {
  const entries: AlmanacStatEntry[] = [];
  const addEntry = (label: string, value: ReactNode) => {
    if (value !== "" && value !== undefined) {
      entries.push({ label, value });
    }
  };

  addEntry(t("almanac.tower.damage"), towerConfig.damage.toFixed(1));
  addEntry(t("almanac.tower.range"), towerConfig.range.toFixed(1));
  addEntry(t("almanac.tower.fireRate"), `${towerConfig.fireRate.toFixed(1)}s`);
  addEntry(t("almanac.tower.targeting"), towerConfig.targeting);
  if (towerConfig.slowAmount !== undefined) {
    addEntry(
      t("almanac.tower.slow"),
      `${Math.round(towerConfig.slowAmount * 100)}% / ${
        towerConfig.slowDuration ?? 0
      }s`
    );
  }
  if (towerConfig.aoeRadius !== undefined) {
    addEntry(t("almanac.tower.aoe"), towerConfig.aoeRadius.toFixed(1));
  }
  if (towerConfig.maxPierce !== undefined) {
    addEntry(t("almanac.tower.pierce"), towerConfig.maxPierce);
  }
  if (towerConfig.relayNeighborDamageBonusFraction !== undefined) {
    addEntry(
      t("almanac.tower.neighborBuff"),
      `+${Math.round(towerConfig.relayNeighborDamageBonusFraction * 100)}% / +${Math.round(
        (towerConfig.relayNeighborRangeBonusFraction ?? 0) * 100
      )}%`
    );
  }
  if (towerConfig.maxChainHops !== undefined) {
    addEntry(
      t("almanac.tower.chain"),
      `${towerConfig.maxChainHops} (-${Math.round(
        (1 - (towerConfig.chainDamageMultiplierPerHop ?? 1)) * 100
      )}%/hop)`
    );
  }

  return entries;
};

type AlmanacTowerCardProps = {
  towerConfig: TowerConfig;
};

const AlmanacTowerCard: FC<AlmanacTowerCardProps> = ({ towerConfig }) => {
  const { t } = useTranslation();
  const TowerIcon = ALMANAC_TOWER_ICONS[towerConfig.id];
  const statEntries = getTowerStatEntries(towerConfig, t);

  return (
    <UICard className="relative ring-1 ring-primary/20">
      <UICardHeader className="py-0! border-b border-border relative">
        <UICardTitle className="absolute top-1 left-4 gap-2">
          <div
            className="relative flex items-center justify-center w-8 h-8 rounded-full text-white"
            style={{
              backgroundColor: towerConfig.color,
              boxShadow: `0 0 12px ${towerConfig.color}40`,
            }}
          >
            <TowerIcon size={16} className="shrink-0" />
          </div>
          <UITypography variant="medium">
            {t(`towers.${towerConfig.id}.name`)}
          </UITypography>
        </UICardTitle>
        <UICardAction>
          <UIMoney
            money={towerConfig.cost}
            variant="medium"
            iconSize={12}
            className="mt-2 shrink-0"
          />
        </UICardAction>
      </UICardHeader>

      <UICardContent>
        <UICardDescription>
          {t(`towers.${towerConfig.id}.description`)}
        </UICardDescription>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
          {statEntries.map((entry) => (
            <AlmanacStatRow
              key={entry.label}
              icon={TowerIcon}
              iconClassName="text-primary/70"
              label={entry.label}
              value={entry.value}
            />
          ))}
        </div>
      </UICardContent>
    </UICard>
  );
};

const ALMANAC_UPGRADE_ICONS: Record<EnemyUpgradeId, LucideIcon> = {
  armored: HeartPulse,
  swift: Wind,
  slowResistance: Zap,
  regenerating: Heart,
};

type AlmanacUpgradeCardProps = {
  upgradeConfig: EnemyUpgradeConfig;
};

const AlmanacUpgradeCard: FC<AlmanacUpgradeCardProps> = ({
  upgradeConfig,
}) => {
  const { t } = useTranslation();
  const UpgradeIcon = ALMANAC_UPGRADE_ICONS[upgradeConfig.id];

  return (
    <UICard className="relative ring-1 ring-primary/20">
      <UICardHeader className="py-0! border-b border-border relative">
        <UICardTitle className="absolute top-1 left-4 gap-2">
          <div
            className="relative flex items-center justify-center w-8 h-8 rounded-full text-white"
            style={{
              backgroundColor: upgradeConfig.indicatorColor,
              boxShadow: `0 0 12px ${upgradeConfig.indicatorColor}40`,
            }}
          >
            <UpgradeIcon size={16} className="shrink-0" />
          </div>
          <UITypography variant="medium">
            {t(`enemyUpgrades.${upgradeConfig.id}.name`)}
          </UITypography>
        </UICardTitle>
        <UICardAction>
          <UITypography
            variant="small"
            className="mt-2 shrink-0 font-semibold text-green-400"
          >
            {t("almanac.upgrade.reward", {
              percent: Math.round((upgradeConfig.rewardMultiplier - 1) * 100),
            })}
          </UITypography>
        </UICardAction>
      </UICardHeader>

      <UICardContent>
        <UICardDescription>
          {t(`enemyUpgrades.${upgradeConfig.id}.description`)}
        </UICardDescription>
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
  const towerTypes = useGameStore(towerTypesSelector);
  const enemyUpgrades = useGameStore(enemyUpgradesSelector);
  const discoveredEnemies = useAlmanacStore(discoveredEnemiesSelector);
  const [activeTab, setActiveTab] = useState<AlmanacTab>("enemies");

  const enemyEntries = (
    enemyTypes
      ? (Object.entries(enemyTypes) as [EnemyType, EnemyConfig][])
      : []
  ).sort((a, b) => a[0].localeCompare(b[0]));
  const towerEntries = (
    towerTypes
      ? (Object.entries(towerTypes) as [TowerType, TowerConfig][])
      : []
  ).sort((a, b) => a[1].cost - b[1].cost);
  const upgradeEntries = (
    enemyUpgrades
      ? (
          Object.entries(enemyUpgrades) as [
            EnemyUpgradeId,
            EnemyUpgradeConfig,
          ][]
        )
      : []
  ).sort((a, b) => a[1].displayRank - b[1].displayRank);

  const discoveryCount = discoveredEnemies.length;
  const totalCount = enemyEntries.length;

  const tabButtons: Array<{
    tab: AlmanacTab;
    label: string;
    icon: LucideIcon;
  }> = [
    { tab: "enemies", label: t("almanac.tabEnemies"), icon: Skull },
    { tab: "towers", label: t("almanac.tabTowers"), icon: GitBranch },
    { tab: "upgrades", label: t("almanac.tabUpgrades"), icon: Zap },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "towers":
        return (
          <>
            <div className="grid grid-cols-1 gap-4">
              {towerEntries.map(([type, config]) => (
                <AlmanacTowerCard key={type} towerConfig={config} />
              ))}
            </div>
            {towerEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
                <UITypography
                  variant="body"
                  className="text-muted-foreground"
                >
                  {t("almanac.noTowerData")}
                </UITypography>
              </div>
            )}
          </>
        );
      case "upgrades":
        return (
          <>
            <div className="grid grid-cols-1 gap-4">
              {upgradeEntries.map(([id, config]) => (
                <AlmanacUpgradeCard key={id} upgradeConfig={config} />
              ))}
            </div>
            {upgradeEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
                <UITypography
                  variant="body"
                  className="text-muted-foreground"
                >
                  {t("almanac.noUpgradeData")}
                </UITypography>
              </div>
            )}
          </>
        );
      case "enemies":
      default:
        return (
          <>
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
              <UITypography
                variant="small"
                className="w-full py-1 text-end"
              >
                {t("almanac.discoveredCount", {
                  found: discoveryCount,
                  total: totalCount,
                })}
              </UITypography>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {enemyEntries.map(([type, config]) => (
                <AlmanacEnemyCard
                  key={type}
                  enemyConfig={config}
                  isDiscovered={discoveredEnemies.includes(type)}
                />
              ))}
            </div>

            {enemyEntries.length === 0 && (
              <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
                <UITypography
                  variant="body"
                  className="text-muted-foreground"
                >
                  {t("almanac.noData")}
                </UITypography>
              </div>
            )}
          </>
        );
    }
  };

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

      <UICardContent className="min-h-0 flex-1 gap-4">
        <div
          role="tablist"
          aria-label={t("almanac.title")}
          className="flex gap-1 rounded-md bg-muted/40 p-1"
        >
          {tabButtons.map(({ tab, label, icon }) => (
            <AlmanacTabButton
              key={tab}
              tab={tab}
              label={label}
              icon={icon}
              active={activeTab === tab}
              onSelect={setActiveTab}
            />
          ))}
        </div>

        <div
          role="tabpanel"
          className="min-h-0 flex-1 flex flex-col gap-4 overflow-y-auto pr-1"
        >
          {renderTabContent()}
        </div>
      </UICardContent>
    </UICard>
  );
};
