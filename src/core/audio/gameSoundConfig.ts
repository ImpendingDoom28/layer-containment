import { defineSoundConfigs, type WorldPosition } from "@webgamedevkit/audio-engine";

import { GameEvent } from "../../core/types/enums/events";
import type {
  EnemyType,
  ProjectileType,
  TowerType,
} from "../../core/types/game";

import { GAME_AUDIO_CATEGORIES } from "./useAudioStore";

export type { WorldPosition };

export const TOWER_FIRE_SRCES = {
  laser: "assets/audio/laser-shot.wav",
  basic: "assets/audio/basic-shot.mp3",
  chain: "assets/audio/basic-shot.mp3",
} as const;

export type TowerFireSrcKey = keyof typeof TOWER_FIRE_SRCES;

export const SOUND_CONFIGS = defineSoundConfigs<GameEvent>(
  GAME_AUDIO_CATEGORIES,
  {
    [GameEvent.TOWER_PLACED]: {
      category: "sfx",
    },
    [GameEvent.TOWER_SOLD]: {
      category: "sfx",
    },
    [GameEvent.TOWER_FIRE]: {
      category: "sfx",
    },
    [GameEvent.ENEMY_KILLED]: {
      category: "sfx",
    },
    [GameEvent.ENEMY_REACHED_END]: {
      category: "sfx",
    },
    [GameEvent.PROJECTILE_HIT]: {
      category: "sfx",
    },
    [GameEvent.WAVE_STARTED]: {
      category: "sfx",
    },
    [GameEvent.GAME_OVER]: {
      category: "sfx",
      spatial: false,
    },
    [GameEvent.GAME_WON]: {
      category: "sfx",
      spatial: false,
    },
    [GameEvent.GAME_PAUSED]: {
      category: "sfx",
      spatial: false,
    },
    [GameEvent.GAME_RESUMED]: {
      category: "sfx",
      spatial: false,
    },
    [GameEvent.UI_CLICK]: {
      category: "sfx",
      spatial: false,
    },
    [GameEvent.UI_ACTION_DENIED]: {
      category: "sfx",
      spatial: false,
    },
  }
);

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
