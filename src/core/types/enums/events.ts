/**
 * Game events that can be triggered
 */
export const GameEvent = {
  TOWER_PLACED: "tower_placed",
  TOWER_SOLD: "tower_sold",
  TOWER_FIRE: "tower_fire",
  ENEMY_KILLED: "enemy_killed",
  /** A tower hit was dodged (missing-out upgrade); no damage was dealt. */
  ENEMY_DODGED: "enemy_dodged",
  ENEMY_REACHED_END: "enemy_reached_end",
  PROJECTILE_HIT: "projectile_hit",
  /**
   * An AoE or BRL rocket detonated (its area damage resolved). Carries the
   * flat-field hit position so the micro camera punch kicks toward it.
   */
  PROJECTILE_EXPLOSION: "projectile_explosion",
  /**
   * The player's base took damage (enemies reaching the end of a path).
   * Carries the merged damage amount and the flat-field damage position so
   * the stronger, red-tinted micro camera punch can kick toward it.
   */
  BASE_DAMAGE_TAKEN: "base_damage_taken",
  /**
   * The player's money changed (a gain or a spend). The HUD eases the money
   * number toward the new value and flashes the money card (gold on a gain,
   * red on a spend).
   */
  MONEY_CHANGED: "money_changed",
  /**
   * A level's state was (re)initialized — a new run or a restart. Carries the
   * load's unique id (`run`) and the spawn portals' flat-field positions, so
   * the scene's `CometStrike` orchestrator can arm its one-shot load comet
   * (the portals are hidden while it flies and grow out of the scorch when it
   * strikes) at exactly this load. The main menu's ambient level emits the
   * same event so its portals get the same treatment.
   */
  LEVEL_ENTERED: "level_entered",
  /**
   * A level-load comet struck the planet (the instant of impact, ~1.2 s
   * after the level entered). Carries the flat-field impact position so the
   * camera's micro punch kicks toward the scorch. Visual-only: the strike's
   * whoosh (the `LEVEL_ENTERED` sound) already spans into the impact, so no
   * extra audio plays.
   */
  COMET_IMPACT: "comet_impact",
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
