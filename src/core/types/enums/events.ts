/**
 * Game events that can be triggered
 */
export const GameEvent = {
  TOWER_PLACED: "tower_placed",
  TOWER_SOLD: "tower_sold",
  TOWER_FIRE: "tower_fire",
  ENEMY_KILLED: "enemy_killed",
  ENEMY_REACHED_END: "enemy_reached_end",
  PROJECTILE_HIT: "projectile_hit",
  WAVE_STARTED: "wave_started",
  GAME_OVER: "game_over",
  GAME_WON: "game_won",
  GAME_PAUSED: "game_paused",
  GAME_RESUMED: "game_resumed",
  UI_CLICK: "ui_click",
  UI_ACTION_DENIED: "ui_action_denied",
  UI_ACTION_HOLD_START: "ui_action_hold_start",
  UI_ACTION_HOLD_END: "ui_action_hold_end",
  UI_ACTION_HOLD_ABORT: "ui_action_hold_abort",
} as const;

export type GameEvent = (typeof GameEvent)[keyof typeof GameEvent];
