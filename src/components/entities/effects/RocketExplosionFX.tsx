import { FC, memo, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  type Group,
  type Mesh,
} from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";

const EXPLOSION_DURATION = 0.55;
// The fireball is the quick bright flash — it resolves within the first half of
// the burst so the shockwave (the actual blast radius) stays the readable,
// lasting part of the effect.
const FIREBALL_FRACTION = 0.5;

// The shockwave is two shared unit-radius rings (authored in the local XZ
// plane), both additive-blended so the ground reads through them and they glow
// via the bloom pass instead of painting over it:
//   - a thin, bright FRONT (the leading edge) that sweeps out and lands on the
//     blast radius, and
//   - a wider, fainter BODY behind it (the displaced "wave") that fills the
//     area the front has already passed and dissipates as it spreads.
// Each explosion scales them out to its blast radius, so every explosion
// reuses the same buffers instead of re-building geometry.
const sharedFrontGeometry = new RingGeometry(0.92, 1, 48);
const sharedBodyGeometry = new RingGeometry(0.5, 1, 48);

// Kept deliberately low: the shockwave should barely tint the ground (a faint
// ripple you notice if you watch for it), with only the front's relative
// brightness distinguishing it from the body.
const FRONT_OPACITY = 0.3;
const BODY_OPACITY = 0.1;

// One shared radial-gradient glow (white core fading to transparent) for every
// explosion's fireball. Lazily created so importing this module in a DOM-less
// (node) test environment never touches `document`.
let glowTexture: CanvasTexture | null = null;
const getGlowTexture = (): CanvasTexture | null => {
  if (glowTexture) return glowTexture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.7)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.22)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  glowTexture = new CanvasTexture(canvas);
  return glowTexture;
};

type RocketExplosionFXProps = {
  /** World-space point on the planet surface the rocket struck. */
  position: [number, number, number];
  /** Surface normal at the impact as a quaternion (the group's local +Y). */
  quaternion: Quaternion;
  /** The blast radius the shockwave expands to (the visible area of effect). */
  radius: number;
  /** Tints the fireball and shockwave (the BRL's tower color). */
  color: string;
  duration?: number;
  onComplete?: () => void;
};

/**
 * The BRL rocket's impact: a short bright fireball plus a ground **shockwave**
 * that sweeps out to the blast radius and dissipates. The shockwave is the
 * readable "area of effect" — its front lands exactly on the projectile's
 * `aoeRadius`, so the player sees how far the splash reaches without a
 * persistent marker cluttering the field. It is a thin bright front over a
 * faint wide trailing body, both additive-blended (transparent, the ground
 * shows through) and glowing via the bloom pass, so it reads as a shockwave
 * rather than a filled disc. The fireball is a camera-facing additive sprite.
 *
 * Everything animates in `useFrame` by mutation on the pause-aware simulation
 * clock (the burst freezes with the world on pause), so a rocket landing costs
 * no React state beyond the mount/unmount of this short-lived component. Under
 * `prefers-reduced-motion` the fireball is skipped (the blast-radius shockwave
 * still plays).
 */
export const RocketExplosionFX: FC<RocketExplosionFXProps> = memo(
  ({
    position,
    quaternion,
    radius,
    color,
    duration = EXPLOSION_DURATION,
    onComplete,
  }) => {
    const { getSimulationTime } = useSimulationClock();
    const reducedMotion = useReducedMotion();

    const groupRef = useRef<Group>(null);
    const frontRef = useRef<Mesh>(null);
    const bodyRef = useRef<Mesh>(null);
    // The simulation time the burst started at (captured on the first frame),
    // so the whole effect runs on the pause-aware clock and freezes with the
    // world on pause.
    const startTimeRef = useRef<number | null>(null);
    const doneRef = useRef(false);

    // The group lies flat on the planet surface by inheriting the impact's
    // surface-normal orientation. Applied imperatively (rather than a
    // `quaternion` prop) so it copies the value into the group's own
    // quaternion instead of assigning a cross-instance object to a read-only
    // property.
    useLayoutEffect(() => {
      groupRef.current?.quaternion.copy(quaternion);
    }, [quaternion]);

    // Fireball sprite: the radial texture is shared, the material is per
    // explosion (each flash fades on its own timeline).
    const fireballMaterial = useMemo(() => {
      const tint = new Color("#ffffff").lerp(new Color(color), 0.5);
      return new SpriteMaterial({
        map: getGlowTexture(),
        color: tint,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      });
    }, [color]);
    const fireball = useMemo(() => {
      const sprite = new Sprite(fireballMaterial);
      sprite.visible = false;
      sprite.scale.setScalar(radius * 0.4);
      return sprite;
    }, [fireballMaterial, radius]);

    // Shockwave: two per-explosion additive materials (each fades on its own
    // timeline); the geometry is shared.
    const frontMaterial = useMemo(
      () =>
        new MeshBasicMaterial({
          color: new Color(color),
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
        }),
      [color]
    );
    const bodyMaterial = useMemo(
      () =>
        new MeshBasicMaterial({
          color: new Color(color),
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
        }),
      [color]
    );
    useLayoutEffect(
      () => () => {
        fireballMaterial.dispose();
        frontMaterial.dispose();
        bodyMaterial.dispose();
      },
      [fireballMaterial, frontMaterial, bodyMaterial]
    );

    useFrame((state) => {
      if (doneRef.current) return;
      startTimeRef.current ??= getSimulationTime(state.clock.elapsedTime);
      const elapsed =
        getSimulationTime(state.clock.elapsedTime) - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Fireball: a quick ease-out swell that resolves in the first half.
      const fb = Math.min(progress / FIREBALL_FRACTION, 1);
      const fbEase = 1 - (1 - fb) ** 2;
      const showFireball = !reducedMotion && progress < FIREBALL_FRACTION;
      fireball.visible = showFireball;
      if (showFireball) {
        fireball.scale.setScalar(radius * (0.4 + 0.9 * fbEase));
        fireballMaterial.opacity = (1 - fb) * 0.9;
      }

      // Shockwave: the front and body sweep out together (fast at first,
      // decelerating) to the blast radius, then dissipate as they spread.
      // Additive blending keeps the ground visible through them; the fade
      // front is the bright leading edge, the body the faint trailing wave.
      const ease = 1 - (1 - progress) ** 3;
      const scale = Math.max(radius * ease, 1e-4);
      const fade = 1 - progress;
      if (frontRef.current) {
        frontRef.current.scale.setScalar(scale);
        frontMaterial.opacity = fade * FRONT_OPACITY;
      }
      if (bodyRef.current) {
        bodyRef.current.scale.setScalar(scale);
        bodyMaterial.opacity = fade ** 1.5 * BODY_OPACITY;
      }

      if (progress >= 1) {
        doneRef.current = true;
        fireball.visible = false;
        frontMaterial.opacity = 0;
        bodyMaterial.opacity = 0;
        onComplete?.();
      }
    });

    return (
      <group ref={groupRef} position={position}>
        <primitive object={fireball} />
        <mesh
          ref={bodyRef}
          geometry={sharedBodyGeometry}
          material={bodyMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          // Collapsed until the first frame animates it out (no full-size
          // flash on the frame the rocket lands).
          scale={0}
          raycast={() => null}
        />
        <mesh
          ref={frontRef}
          geometry={sharedFrontGeometry}
          material={frontMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0}
          raycast={() => null}
        />
      </group>
    );
  }
);

RocketExplosionFX.displayName = "RocketExplosionFX";
