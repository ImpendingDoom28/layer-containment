import type { SoundConfig, WorldPosition } from "../../spatial-audio/types";
import { UI_ACTION_DENIED_SFX_VOLUME } from "../../constants/uiActionDeniedFeedback";
import { GameEvent } from "../../core/types/enums/events";
import type {
  EnemyType,
  ProjectileType,
  TowerType,
} from "../../core/types/game";

import type { GameAudioCategory } from "./useAudioStore";

export type { WorldPosition };

export const SOUND_CONFIGS: Record<
  GameEvent,
  SoundConfig<GameAudioCategory>
> = {
  [GameEvent.TOWER_PLACED]: {
    category: "sfx",
    volume: 70,
  },
  [GameEvent.TOWER_SOLD]: {
    category: "sfx",
    volume: 60,
  },
  [GameEvent.TOWER_FIRE]: {
    category: "sfx",
    volume: 50,
    srces: {
      laser: "assets/audio/laser-shot.wav",
      basic: "assets/audio/basic-shot.mp3",
      chain: "assets/audio/basic-shot.mp3",
    },
  },
  [GameEvent.ENEMY_KILLED]: {
    category: "sfx",
    volume: 60,
  },
  [GameEvent.ENEMY_REACHED_END]: {
    category: "sfx",
    volume: 80,
  },
  [GameEvent.PROJECTILE_HIT]: {
    category: "sfx",
    volume: 40,
  },
  [GameEvent.WAVE_STARTED]: {
    category: "sfx",
    volume: 90,
  },
  [GameEvent.GAME_OVER]: {
    category: "sfx",
    volume: 100,
    spatial: false,
  },
  [GameEvent.GAME_WON]: {
    category: "sfx",
    volume: 100,
    spatial: false,
  },
  [GameEvent.GAME_PAUSED]: {
    category: "sfx",
    volume: 50,
    spatial: false,
  },
  [GameEvent.GAME_RESUMED]: {
    category: "sfx",
    volume: 30,
    spatial: false,
  },
  [GameEvent.UI_CLICK]: {
    category: "sfx",
    volume: 30,
    spatial: false,
  },
  [GameEvent.UI_ACTION_DENIED]: {
    category: "sfx",
    volume: UI_ACTION_DENIED_SFX_VOLUME,
    spatial: false,
  },
};

export type AudioEventDataMap = {
  "tower_fire": {
    towerId: number;
    towerType: TowerType;
    worldPosition: WorldPosition;
  };
  "enemy_killed": {
    enemyId: number;
    enemyType: EnemyType;
    worldPosition: WorldPosition;
  };
  "enemy_reached_end": {
    enemyId: number;
    enemyType: EnemyType;
    worldPosition: WorldPosition;
  };
  "projectile_hit": {
    projectileId: number;
    enemyId: number;
    towerType: TowerType;
    projectileType: ProjectileType;
    worldPosition: WorldPosition;
  };
  "wave_started": {
    waveNumber: number;
    worldPosition: WorldPosition;
  };
  "game_over": {
    gameOverType: "loss" | "win";
  };
  "game_paused": {
    gamePausedType: "pause";
  };
  "ui_click": {
    uiClickType?: "click" | "hover" | "select";
  };
  "game_resumed": {
    gameResumedType: "resume";
  };
  "game_won": {
    gameWonType: "win";
  };
  "tower_placed": {
    towerId: number;
    towerType: TowerType;
    gridX: number;
    gridZ: number;
    worldPosition: WorldPosition;
  };
  "tower_sold": {
    towerId: number;
    towerType: TowerType;
    worldPosition: WorldPosition;
  };
  "ui_action_denied": {
    reason: "insufficient_funds";
    towerType: TowerType;
  };
};

export type AudioEventData<T extends GameEvent> = AudioEventDataMap[T];
