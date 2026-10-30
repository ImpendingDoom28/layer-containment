import type { PlayableLevelId } from "../../constants/playableLevels";

export type MenuActions = {
  onStartGameWithLevel: (
    level: PlayableLevelId,
    startingHealth: number
  ) => void | Promise<void>;
  onOpenLevelEditor: () => void;
  onOpenTestingLevel: () => void;
};
