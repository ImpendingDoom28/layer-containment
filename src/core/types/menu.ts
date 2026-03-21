import type { PlayableLevelId } from "../../constants/playableLevels";

export type MenuActions = {
  onStartGameWithLevel: (level: PlayableLevelId) => void | Promise<void>;
  onOpenLevelEditor: () => void;
};
