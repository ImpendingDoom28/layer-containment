import {
  type AnimationAction,
  type AnimationClip,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type Object3D,
} from "three";

import type { ModelAnimationSpec } from "../core/types/game";

// Re-exported so a consumer can pull the player and its spec types from one
// module (the types themselves live in `core/types`, the layering root).
export type { ModelAnimationClipSpec, ModelAnimationSpec } from "../core/types/game";

/** How long a loop→loop or loop→one-shot hand-off crossfades (seconds). */
const CROSSFADE_SECONDS = 0.15;

/**
 * A generic player for a model's own baked-in animation clips (the
 * `gltf.animations` array), decoupled from React so it can be unit-tested
 * against the real `three` mixer.
 *
 * The caller owns two things: the *naming* (the spec: logical state → clip
 * name) and the *clock* (it advances `update` by the simulation delta each
 * frame, so the motion freezes with the world on pause and runs faster with
 * the time dilation). Everything about *which* clip plays and *how* the
 * hand-offs blend lives here, driven purely by the requested state — never by
 * a specific model or enemy type.
 *
 * Hand-off rules:
 * - loop → loop: a short crossfade (no pop).
 * - loop → one-shot: the one-shot asserts itself at full weight from its
 *   first keyframe while the loop fades out, so a teleport starts from the
 *   pose the loop left the body in.
 * - one-shot → one-shot (teleport-out → teleport-in): the new one-shot takes
 *   over at full weight and the old one is released. The clips are authored to
 *   share the hand-off pose (teleport-out ends where teleport-in begins), so
 *   the release is seamless.
 * - one-shot → loop: the one-shot is stopped (it lands on its final pose, the
 *   rest pose for a teleport-in) and the loop takes over, so the body eases
 *   from the one-shot's end into the loop.
 * - Re-requesting a state that is already on top is a no-op — including a
 *   finished one-shot, which holds its final pose until a different state is
 *   requested.
 *
 * Clips named in the spec but missing from the GLB are skipped (the state
 * simply has nothing to play), so a model with a partial set of clips degrades
 * gracefully instead of throwing.
 */
export class ModelAnimationMixer {
  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly isLoop = new Map<string, boolean>();
  private current: string | null = null;

  constructor(
    root: Object3D,
    clips: AnimationClip[],
    specs: ModelAnimationSpec
  ) {
    this.mixer = new AnimationMixer(root);
    const byName = new Map(clips.map((clip) => [clip.name, clip]));
    for (const [state, spec] of Object.entries(specs)) {
      const clip = byName.get(spec.clip);
      if (!clip) continue; // no such clip in this model: skip the state.
      // A distinct clip instance per state: `clipAction` caches by clip
      // identity, so two states naming the same clip would share one action
      // and the later spec's loop/speed would overwrite the earlier one.
      // (The track value buffers are shared — they are read-only.)
      const action = this.mixer.clipAction(clip.clone());
      const loop = (spec.loop ?? "repeat") === "repeat";
      // `LoopRepeat` with a finite `repetitions` plays that many iterations
      // and then stops (the body would freeze at the rest pose); a looping
      // state must run forever.
      action.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
      if (!loop) action.clampWhenFinished = true;
      if (spec.speed !== undefined) action.timeScale = spec.speed;
      this.actions.set(state, action);
      this.isLoop.set(state, loop);
    }
  }

  /** True when the model has at least one clip usable for the given states. */
  get hasClips(): boolean {
    return this.actions.size > 0;
  }

  /**
   * Plays the clip for `state`, crossfading (or handing off) from whatever is
   * currently playing. Unknown states are ignored; re-requesting the state
   * that is already on top is a no-op (a finished one-shot keeps holding its
   * final pose).
   */
  play(state: string): void {
    const action = this.actions.get(state);
    if (!action || this.current === state) return;

    const previousState = this.current;
    const previousAction = previousState
      ? this.actions.get(previousState)
      : undefined;
    const previousIsLoop = previousState
      ? this.isLoop.get(previousState) === true
      : false;

    if (this.isLoop.get(state) === true) {
      // Target is a looping clip.
      if (previousAction && !previousIsLoop) {
        // A LoopOnce + clampWhenFinished action is `paused` exactly from the
        // moment it finishes (three pauses it at its final frame), so `paused`
        // is the "has it run to completion" check.
        if (previousAction.paused) {
          // A finished one-shot holds its final pose (a teleport-in's final
          // frame is the rest pose by authoring). Stopping it restores the
          // rest pose, so the loop owns the body from there.
          previousAction.stop();
          action.reset();
          action.setEffectiveWeight(1);
          action.play();
        } else {
          // The one-shot is still mid-playback when a loop takes over (the
          // state changed before the clip ran to completion): crossfade so the
          // body eases out of the one-shot's mid-pose instead of snapping to
          // the rest pose.
          //
          // Both crossfades share the same preparation: the destination is
          // reset *before* the fade is scheduled, because an action that
          // finished a previous fade is disabled and stays disabled until a
          // reset re-enables it — crossfading into it would leave the body
          // unmoved. (A reset after scheduling would call `stopFading` and
          // drop the new fade, so the order matters.) Warp is off: it would
          // overwrite the destination's configured `timeScale` (a `speed`
          // spec) for the fade's duration.
          action.reset();
          previousAction
            .crossFadeTo(action, CROSSFADE_SECONDS, false)
            .play();
        }
      } else if (previousAction) {
        // loop → loop: crossfade (the previous fades out as the new fades in).
        action.reset();
        previousAction.crossFadeTo(action, CROSSFADE_SECONDS, false).play();
      } else {
        action.reset();
        action.setEffectiveWeight(1);
        action.play();
      }
    } else {
      // Target is a one-shot: it asserts itself at full weight from its first
      // keyframe (no fade-in, so it reaches its final pose on schedule), and
      // the previous action is released. The clips share the hand-off pose, so
      // the release is seamless.
      if (previousAction) {
        if (previousIsLoop) {
          previousAction.fadeOut(CROSSFADE_SECONDS);
        } else {
          previousAction.setEffectiveWeight(0);
        }
      }
      action.reset();
      action.setEffectiveWeight(1);
      action.play();
    }

    this.current = state;
  }

  /**
   * Stops everything and restores the rest pose (the original state captured
   * when the bindings were first made). Used when the body should hold still
   * (e.g. `prefers-reduced-motion`); a later `play` resumes normally.
   */
  stopAll(): void {
    this.current = null;
    this.mixer.stopAllAction();
  }

  /** Advances the mixer by `delta` seconds of *simulation* time. */
  update(delta: number): void {
    this.mixer.update(delta);
  }

  /** The logical state currently on top (or `null` before the first play). */
  get currentState(): string | null {
    return this.current;
  }

  /** Releases all actions and unbinds the root (call on unmount). */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}
