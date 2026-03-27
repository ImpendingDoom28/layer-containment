/**
 * Game events that can be triggered
 */
export enum GameEvent {
  TOWER_PLACED = "tower_placed",
  TOWER_SOLD = "tower_sold",
  TOWER_FIRE = "tower_fire",
  ENEMY_KILLED = "enemy_killed",
  ENEMY_REACHED_END = "enemy_reached_end",
  PROJECTILE_HIT = "projectile_hit",
  WAVE_STARTED = "wave_started",
  GAME_OVER = "game_over",
  GAME_WON = "game_won",
  GAME_PAUSED = "game_paused",
  GAME_RESUMED = "game_resumed",
  UI_CLICK = "ui_click",
  UI_ACTION_DENIED = "ui_action_denied",
}
