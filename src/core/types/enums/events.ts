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
  /**
   * On-screen touch D-pad held/released a camera move (mobile control
   * scheme). The camera consumes this in place of a physical key.
   */
  TOUCH_CAMERA_MOVE: "touch_camera_move",
  /**
   * On-screen rotation joystick (mobile control scheme) moved by a pixel
   * delta. The camera applies it to its yaw/pitch exactly like a mouse drag.
   */
  TOUCH_CAMERA_ROTATE: "touch_camera_rotate",
} as const;

export type GameEvent = (typeof GameEvent)[keyof typeof GameEvent];
