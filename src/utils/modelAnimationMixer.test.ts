import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  Group,
  QuaternionKeyframeTrack,
  VectorKeyframeTrack,
} from "three";

import { ModelAnimationMixer } from "./modelAnimationMixer";

/**
 * A small stand-in for a boss GLB: a root with two named pivots (like
 * `LC_OMEGA7` → `Anim`), and synthetic clips that move the pivots in
 * distinguishable ways so the tests can assert *which* clip is on top:
 *
 * - `IDLE` (1s loop): A.position eases 0 → 1 (per second).
 * - `WALK` (1s loop): A.position eases 0 → 2, plus a no-op B.quaternion
 *   (the GLB's clips drive quaternions too).
 * - `TELEPORT_OUT` (0.38s once): A.scale shrinks 1 → 0.1 (the beam pose).
 * - `TELEPORT_IN` (0.5s once): A.scale grows 0.1 → 1 back (it begins where
 *   out ends, like the authored clips).
 */
const buildRig = () => {
  const root = new Group();
  const a = new Group();
  a.name = "A";
  const b = new Group();
  b.name = "B";
  root.add(a, b);
  return { root, a, b };
};

const idleClip = () =>
  new AnimationClip("IDLE", 1, [
    new VectorKeyframeTrack("A.position", [0, 1], [0, 0, 0, 1, 0, 0]),
  ]);

const walkClip = () =>
  new AnimationClip("WALK", 1, [
    new VectorKeyframeTrack("A.position", [0, 1], [0, 0, 0, 2, 0, 0]),
    new QuaternionKeyframeTrack("B.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
  ]);

const outClip = () =>
  new AnimationClip("TELEPORT_OUT", 0.38, [
    new VectorKeyframeTrack("A.scale", [0, 0.38], [1, 1, 1, 0.1, 1.35, 0.1]),
  ]);

const inClip = () =>
  new AnimationClip("TELEPORT_IN", 0.5, [
    new VectorKeyframeTrack("A.scale", [0, 0.5], [0.1, 1.35, 0.1, 1, 1, 1]),
  ]);

const loopSpecs = {
  idle: { clip: "IDLE" },
  walk: { clip: "WALK" },
};

describe("ModelAnimationMixer", () => {
  it("plays the first requested state and advances with update", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip()], loopSpecs);

    expect(mixer.hasClips).toBe(true);
    expect(mixer.currentState).toBe(null);

    mixer.play("idle");
    expect(mixer.currentState).toBe("idle");
    mixer.update(0.5);
    expect(a.position.x).toBeCloseTo(0.5, 2);
    // Re-requesting the state on top is a no-op (the loop keeps running).
    mixer.play("idle");
    mixer.update(0.5);
    // A loop state runs forever (not one iteration): just past the first
    // full cycle it is in its second iteration (at the duration boundary
    // three wraps the loop, so the position restarts from 0).
    mixer.update(0.05);
    expect(a.position.x).toBeCloseTo(0.05, 2);
    mixer.dispose();
  });

  it("crossfades from a loop to another loop", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip(), walkClip()], {
      ...loopSpecs,
    });

    mixer.play("idle");
    mixer.update(0.5);

    mixer.play("walk");
    expect(mixer.currentState).toBe("walk");
    // 0.2s in: the 0.15s crossfade is over, so WALK alone drives A at its
    // own time 0.2 → x = 0.4.
    mixer.update(0.2);
    expect(a.position.x).toBeCloseTo(0.4, 2);
    mixer.dispose();
  });

  it("re-enters a loop after a completed crossfade (a faded-out action is disabled)", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip(), walkClip()], {
      ...loopSpecs,
    });

    mixer.play("idle");
    mixer.update(0.5);
    mixer.play("walk");
    mixer.update(0.5); // the fade is long over; idle is now disabled
    expect(mixer.currentState).toBe("walk");
    mixer.play("idle");
    mixer.update(0.2);
    // The destination reset re-enabled idle, so it owns the body again.
    expect(a.position.x).toBeCloseTo(0.2, 2);
    mixer.dispose();
  });

  it("keeps a configured speed when entering a state through a crossfade", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip(), walkClip()], {
      idle: { clip: "IDLE" },
      walk: { clip: "WALK", speed: 2 },
    });

    mixer.play("idle");
    mixer.update(0.5);
    mixer.play("walk");
    mixer.update(0.2); // fade (0.15) over; WALK runs at 2x → time 0.4
    expect(a.position.x).toBeCloseTo(0.8, 1);
    mixer.dispose();
  });

  it("gives independently configured states their own actions", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip()], {
      a: { clip: "IDLE" },
      b: { clip: "IDLE", loop: "once" },
    });

    mixer.play("a");
    mixer.update(0.5);
    // The same clip as a one-shot: it runs to completion and holds.
    mixer.play("b");
    mixer.update(1.5);
    expect(a.position.x).toBeCloseTo(1, 1);
    // State "a" is still a loop (its spec was not clobbered by "b").
    mixer.play("a");
    mixer.update(0.3);
    expect(a.position.x).toBeCloseTo(0.3, 2);
    mixer.dispose();
  });

  it("plays a one-shot at full weight over the loop and holds its final pose", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(
      root,
      [idleClip(), outClip(), inClip()],
      {
        ...loopSpecs,
        "teleport-out": { clip: "TELEPORT_OUT", loop: "once" },
        "teleport-in": { clip: "TELEPORT_IN", loop: "once" },
      }
    );

    mixer.play("idle");
    mixer.update(0.5);
    mixer.play("teleport-out");
    mixer.update(0.38);
    expect(a.scale.x).toBeCloseTo(0.1, 1);
    expect(a.scale.y).toBeCloseTo(1.35, 1);

    // A finished one-shot keeps holding its final pose: re-requesting the
    // state must not restart it (a restart would have x ≈ 0.76 here).
    mixer.play("teleport-out");
    mixer.update(0.1);
    expect(a.scale.x).toBeCloseTo(0.1, 1);
    mixer.dispose();
  });

  it("hands a finished one-shot to a loop by restoring the rest pose", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(
      root,
      [idleClip(), outClip(), inClip()],
      {
        ...loopSpecs,
        "teleport-out": { clip: "TELEPORT_OUT", loop: "once" },
        "teleport-in": { clip: "TELEPORT_IN", loop: "once" },
      }
    );

    mixer.play("teleport-in");
    mixer.update(0.5); // finished, holding the rest pose (scale 1)
    mixer.play("idle");
    mixer.update(0.1);
    // The finished one-shot is stopped (rest pose) and the loop takes over.
    expect(a.scale.x).toBeCloseTo(1, 2);
    expect(a.position.x).toBeCloseTo(0.1, 1);
    mixer.dispose();
  });

  it("hands an in-flight one-shot to a loop with a crossfade, not a snap", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(
      root,
      [idleClip(), outClip()],
      {
        ...loopSpecs,
        "teleport-out": { clip: "TELEPORT_OUT", loop: "once" },
      }
    );

    mixer.play("teleport-out");
    mixer.update(0.1); // mid shrink: x ≈ 0.76
    mixer.play("idle");
    mixer.update(0.05); // mid crossfade: still easing, not snapped to 1
    expect(a.scale.x).toBeGreaterThan(0.1);
    expect(a.scale.x).toBeLessThan(1);
    mixer.update(0.4); // crossfade over, one-shot done: rest pose
    expect(a.scale.x).toBeCloseTo(1, 2);
    mixer.dispose();
  });

  it("chains teleport-out into teleport-in without a gap", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(
      root,
      [outClip(), inClip(), idleClip()],
      {
        idle: { clip: "IDLE" },
        "teleport-out": { clip: "TELEPORT_OUT", loop: "once" },
        "teleport-in": { clip: "TELEPORT_IN", loop: "once" },
      }
    );

    mixer.play("teleport-out");
    mixer.update(0.38); // finished on the beam pose
    expect(a.scale.x).toBeCloseTo(0.1, 1);
    mixer.play("teleport-in");
    mixer.update(0.5); // grows back to the rest pose
    expect(a.scale.x).toBeCloseTo(1, 1);
    expect(a.scale.y).toBeCloseTo(1, 1);
    mixer.dispose();
  });

  it("skips states whose clip is missing from the model", () => {
    const { root } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip()], {
      idle: { clip: "IDLE" },
      "teleport-out": { clip: "DOES_NOT_EXIST" },
    });

    expect(mixer.hasClips).toBe(true); // the idle clip still counts
    mixer.play("teleport-out");
    expect(mixer.currentState).toBe(null); // unknown state: ignored
    mixer.play("idle");
    expect(mixer.currentState).toBe("idle");

    const empty = new ModelAnimationMixer(root, [], {
      idle: { clip: "IDLE" },
    });
    expect(empty.hasClips).toBe(false);
    empty.dispose();
  });

  it("applies a spec's speed as the action's time scale", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [walkClip()], {
      walk: { clip: "WALK", speed: 2 },
    });

    mixer.play("walk");
    mixer.update(0.4); // clip time 0.8 at 2x → x = 1.6
    expect(a.position.x).toBeCloseTo(1.6, 1);
    mixer.dispose();
  });

  it("restores the rest pose on stopAll and releases its state", () => {
    const { root, a } = buildRig();
    const mixer = new ModelAnimationMixer(root, [idleClip(), walkClip()], {
      ...loopSpecs,
    });

    mixer.play("walk");
    mixer.update(0.5);
    expect(a.position.x).toBeCloseTo(1, 1);
    mixer.stopAll();
    expect(mixer.currentState).toBe(null);
    mixer.update(0.5);
    expect(a.position.x).toBeCloseTo(0, 2);
    // A later play resumes normally.
    mixer.play("idle");
    mixer.update(0.25);
    expect(a.position.x).toBeCloseTo(0.25, 2);
    mixer.dispose();
  });
});
