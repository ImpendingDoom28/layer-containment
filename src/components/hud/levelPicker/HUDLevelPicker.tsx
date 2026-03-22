import { FC, useEffect, useState } from "react";
import { ArrowLeft, Radio } from "lucide-react";

import {
  PLAYABLE_LEVEL_IDS,
  type PlayableLevelId,
} from "../../../constants/playableLevels";
import {
  loadLevelConfigFile,
  type LevelConfigData,
} from "../../../core/levelConfig";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { UIButton } from "../../ui/UIButton";
import {
  UICard,
  UICardContent,
  UICardDescription,
  UICardHeader,
  UICardTitle,
} from "../../ui/UICard";
import { UITypography } from "../../ui/UITypography";
import { LevelPreviewSvg } from "./LevelPreviewSvg";
import { cn } from "../../ui/lib/twUtils";

type LevelPickerEntry = {
  id: PlayableLevelId;
  data: LevelConfigData;
};

type HUDLevelPickerProps = {
  onBack: () => void;
  onSelectLevel: (level: PlayableLevelId) => void;
};

export const HUDLevelPicker: FC<HUDLevelPickerProps> = ({
  onBack,
  onSelectLevel,
}) => {
  const tileSize = useGameStore(tileSizeSelector);
  const [entries, setEntries] = useState<LevelPickerEntry[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const loaded = await Promise.all(
          PLAYABLE_LEVEL_IDS.map(async (id) => ({
            id,
            data: await loadLevelConfigFile(id),
          }))
        );
        if (!cancelled) {
          setEntries(loaded);
          setErrorMessage(null);
        }
      } catch (e) {
        if (!cancelled) {
          setErrorMessage(
            e instanceof Error ? e.message : "Failed to load levels"
          );
          setEntries(null);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <UICard className="flex flex-col w-full h-full overflow-y-auto bg-card">
      <UICardHeader>
        <UICardTitle>
          <UIButton onClick={onBack} variant="ghost" size="icon">
            <ArrowLeft />
          </UIButton>
          <UITypography variant="h2">Deploy</UITypography>
        </UICardTitle>
        <UICardDescription>
          <UITypography variant="small" className="text-muted-foreground">
            Select a theater of operations. Tap a sector to begin.
          </UITypography>
        </UICardDescription>
      </UICardHeader>
      <UICardContent className="flex flex-col gap-4">
        {errorMessage && (
          <UITypography variant="small" className="text-destructive">
            {errorMessage}
          </UITypography>
        )}
        {!entries && !errorMessage && (
          <UITypography variant="body" className="text-muted-foreground">
            Loading sectors…
          </UITypography>
        )}
        {entries?.map(({ id, data }, index) => {
          const waveCount = data.waveConfigs.length;
          const title = data.name.trim() || id;

          return (
            <button
              key={id}
              type="button"
              data-testid={`level-picker-${id}`}
              onClick={() => onSelectLevel(id)}
              className={cn(
                "text-left transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                "rounded-xl"
              )}
              style={{
                animationDelay: `${index * 70}ms`,
              }}
            >
              <UICard
                className={cn(
                  "overflow-hidden border-border/60 bg-card/90 ring-1 ring-border/40",
                  "transition-transform duration-300 hover:ring-primary/35 hover:translate-x-0.5"
                )}
              >
                <UICardContent className="flex flex-row items-center gap-3 p-3">
                  <div className="relative size-[4.5rem] shrink-0 overflow-hidden rounded-md bg-muted/20 ring-1 ring-border/30">
                    <LevelPreviewSvg
                      pathWaypoints={data.pathWaypoints}
                      buildings={data.buildings}
                      gridSize={data.gridSize}
                      tileSize={tileSize}
                      className="opacity-95"
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <UICardTitle className="flex items-center gap-2 p-0">
                      <Radio
                        className="size-4 shrink-0 text-primary"
                        aria-hidden
                      />
                      <UITypography
                        variant="medium"
                        className="tracking-wide truncate"
                      >
                        {title}
                      </UITypography>
                    </UICardTitle>
                    <UICardDescription className="p-0">
                      <UITypography
                        variant="small"
                        className="text-muted-foreground"
                      >
                        {waveCount} wave{waveCount === 1 ? "" : "s"}
                      </UITypography>
                    </UICardDescription>
                  </div>
                </UICardContent>
              </UICard>
            </button>
          );
        })}
      </UICardContent>
    </UICard>
  );
};
