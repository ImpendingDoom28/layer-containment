import {
  FC,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Group,
  type Quaternion,
} from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";

// The comet's flight: it enters far off the surface, streaks down in a
// shallow line, and hits the impact point with a bright flash. The descent
// is the bulk of the effect — the strike itself is a single sharp beat.
const COMET_FLIGHT_DURATION = 1.2;
// How far off the surface the comet starts (world units along its incoming
// direction). Long enough to read as a streak, short enough to land in ~1s.
const COMET_START_DISTANCE = 26;
// The comet's incoming direction, in the impact's local frame (local +Y is
// the surface normal): a steep dive with a random bearing around the sky.
// Each strike samples its own direction, so the comets of a level appear to
// come from different places instead of one shared sky corner.
const COMET_DIVE_MIN = 0.35;
const COMET_DIVE_MAX = 0.6;

export const sampleCometIncoming = (out = new Vector3()): Vector3 => {
  const up = COMET_DIVE_MIN + Math.random() * (COMET_DIVE_MAX - COMET_DIVE_MIN);
  const horizontal = Math.sqrt(1 - up * up);
  const bearing = Math.random() * Math.PI * 2;
  return out.set(
    Math.cos(bearing) * horizontal,
    up,
    Math.sin(bearing) * horizontal
  );
};

// The tail: a row of additive glow sprites trailing the head (the same
// shared radial texture the head uses), each smaller and fainter, so the
// comet reads as a fading streak without a shader or extra geometry.
const TAIL_SEGMENTS = 5;
const TAIL_SPACING = 0.95;
const TAIL_BASE_SCALE = 0.42;
const TAIL_BASE_OPACITY = 0.5;
// The impact flash: a quick additive fireball plus a faint ground ripple
// (the same shared ring geometry family as the rocket explosion), so the
// impact reads as one family of effects.
const IMPACT_DURATION = 0.5;
const FIREBALL_FRACTION = 0.55;
const RIPPLE_RADIUS = 2.1;
const RIPPLE_OPACITY = 0.2;
// The hot core colour of the comet: white-hot (bloom picks it up).
const COMET_CORE_COLOR = new Color("#fff7e0");
const COMET_TRAIL_COLOR = new Color("#8be9fd");
const IMPACT_COLOR = new Color("#ffd9a0");

// One shared radial-gradient glow (white core fading to transparent) for
// the comet's head, its tail, and the impact fireball. Lazily created so
// importing this module in a DOM-less (node) test environment never touches
// `document`.
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

// One shared thin-band ring geometry (local XZ plane) for the impact ripple.
const sharedRingGeometry = new RingGeometry(0.92, 1, 32);

// One shared low-poly shard geometry (a geodesic sphere) for the impact
// debris — the same "orthodox" pebble the dust burst uses.
const sharedShardGeometry = new IcosahedronGeometry(1, 0);

const SHARD_COUNT = 7;
const SHARD_TRAVEL_MIN = 0.5;
const SHARD_TRAVEL_MAX = 1.3;
const SHARD_RISE_MIN = 0.16;
const SHARD_RISE_MAX = 0.45;
const SHARD_SIZE_MIN = 0.07;
const SHARD_SIZE_MAX = 0.16;

const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

type ShardSeed = {
  angle: number;
  travel: number;
  rise: number;
  scale: number;
  spin: number;
  phase: number;
};

const makeShardSeeds = (): ShardSeed[] =>
  Array.from({ length: SHARD_COUNT }, () => ({
    angle: rand(0, Math.PI * 2),
    travel: rand(SHARD_TRAVEL_MIN, SHARD_TRAVEL_MAX),
    rise: rand(SHARD_RISE_MIN, SHARD_RISE_MAX),
    scale: rand(SHARD_SIZE_MIN, SHARD_SIZE_MAX),
    spin: rand(3, 8),
    phase: rand(0, Math.PI * 2),
  }));

type CometStrikeFXProps = {
  /** World-space point on the planet surface the comet strikes. */
  position: [number, number, number];
  /** Surface normal at the impact as a quaternion (the group's local +Y). */
  quaternion: Quaternion;
  /**
   * Called once, at the moment the comet reaches the surface (the strike),
   * on the simulation clock — so the portal's reveal can be armed exactly
   * when the rock is hit, not when the level loaded.
   */
  onImpact?: () => void;
  /**
   * Called once the whole strike (flight + impact) has finished; the scene
   * unmounts the effect then.
   */
  onComplete?: () => void;
};

/**
 * The level-load comet strike: a bright comet streaks in from the sky and
 * hits the spawn portal's tile, and out of the scorch the portal opens.
 *
 * It is a short-lived component mounted only for the strike: the flight and
 * the impact animate in `useFrame` by mutation on the pause-aware simulation
 * clock (the strike freezes with the world on pause), and once the impact
 * settles the component unmounts itself via `onComplete`. Under
 * `prefers-reduced-motion` the comet is skipped entirely — the impact (a
 * brief flash + ripple) still marks where the portal opened, and the portal
 * appears at rest.
 */
export const CometStrikeFX: FC<CometStrikeFXProps> = memo(
  ({ position, quaternion, onImpact, onComplete }) => {
    const { getSimulationTime } = useSimulationClock();
    const reducedMotion = useReducedMotion();

    const groupRef = useRef<Group>(null);
    const headRef = useRef<Sprite>(null);
    const tailRefs = useRef<(Sprite | null)[]>([]);
    const fireballRef = useRef<Sprite>(null);
    const rippleRef = useRef<Mesh>(null);
    const shardRefs = useRef<(Mesh | null)[]>([]);
    // The simulation time the strike started at (captured on the first
    // frame), so the whole effect runs on the pause-aware clock and freezes
    // with the world on pause.
    const startTimeRef = useRef<number | null>(null);
    const doneRef = useRef(false);
    // Fires `onImpact` exactly once, at the frame the comet reaches the
    // surface (the start of the impact phase), so the scene can reveal the
    // portal at the strike, not when the level loaded.
    const impactFiredRef = useRef(false);

    // Lie the group flat on the planet surface (local +Y = surface normal),
    // applied imperatively so the group's own quaternion is copied, not
    // assigned a cross-instance object to a read-only property.
    useLayoutEffect(() => {
      groupRef.current?.quaternion.copy(quaternion);
    }, [quaternion]);

    // Head: one camera-facing additive sprite (the hot core); the bloom
    // pass gives it the comet halo. The material is per-strike (it fades on
    // its own timeline).
    const headMaterial = useMemo(
      () =>
        new SpriteMaterial({
          map: getGlowTexture(),
          color: COMET_CORE_COLOR,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      []
    );

    // Tail: a row of additive glow sprites behind the head, each smaller
    // and fainter. The materials are per-strike (each fades on the same
    // timeline); the texture is shared.
    const tailMaterials = useMemo(
      () =>
        Array.from(
          { length: TAIL_SEGMENTS },
          () =>
            new SpriteMaterial({
              map: getGlowTexture(),
              color: COMET_TRAIL_COLOR,
              transparent: true,
              opacity: 0,
              blending: AdditiveBlending,
              depthWrite: false,
            })
        ),
      []
    );

    // Impact fireball: the same radial glow sprite as the head, tinted
    // warm.
    const fireballMaterial = useMemo(
      () =>
        new SpriteMaterial({
          map: getGlowTexture(),
          color: IMPACT_COLOR,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      []
    );

    // Impact ripple: one per-strike additive material; the geometry is
    // shared.
    const rippleMaterial = useMemo(
      () =>
        new MeshBasicMaterial({
          color: IMPACT_COLOR,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
          side: DoubleSide,
        }),
      []
    );

    // Debris: a handful of rock shards kicked out of the scorch (lit,
    // flat-shaded, like the dust burst's shards). One shared material —
    // they all fade on the same timeline.
    const shardMaterial = useMemo(
      () =>
        new MeshStandardMaterial({
          color: new Color("#8a7f72"),
          roughness: 0.9,
          metalness: 0,
          flatShading: true,
          transparent: true,
          opacity: 0,
        }),
      []
    );
    const seeds = useMemo(() => makeShardSeeds(), []);

    // This strike's incoming direction, sampled once so the whole flight
    // (head + tail) shares one line and the comets of a level come from
    // different sky bearings.
    const incoming = useMemo(() => sampleCometIncoming(), []);

    useLayoutEffect(
      () => () => {
        headMaterial.dispose();
        for (const material of tailMaterials) material.dispose();
        fireballMaterial.dispose();
        rippleMaterial.dispose();
        shardMaterial.dispose();
      },
      [
        headMaterial,
        tailMaterials,
        fireballMaterial,
        rippleMaterial,
        shardMaterial,
      ]
    );

    // Reset the strike's transform if it is unmounted mid-flight (a scene
    // transition), so no leftover pose leaks into the next scene.
    useEffect(() => {
      return () => {
        if (headRef.current) headRef.current.visible = false;
        for (const tail of tailRefs.current) {
          if (tail) tail.visible = false;
        }
        if (fireballRef.current) fireballRef.current.visible = false;
        if (rippleRef.current) rippleRef.current.scale.setScalar(0);
        for (const shard of shardRefs.current) {
          if (shard) shard.visible = false;
        }
      };
    }, []);

    useFrame((state) => {
      if (doneRef.current) return;
      startTimeRef.current ??= getSimulationTime(state.clock.elapsedTime);
      const elapsed =
        getSimulationTime(state.clock.elapsedTime) - startTimeRef.current;
      if (elapsed < 0) return;

      const flightProgress = Math.min(
        elapsed / COMET_FLIGHT_DURATION,
        1
      );
      const impactElapsed = elapsed - COMET_FLIGHT_DURATION;
      const impactProgress =
        impactElapsed < 0 ? 0 : Math.min(impactElapsed / IMPACT_DURATION, 1);

      // Reveal the portal the moment the strike lands, before the completion
      // return below: a single large delta (e.g. the tab was throttled) can
      // jump straight past the impact window, and onImpact must still fire
      // exactly once in that case or the portal stays hidden for the run.
      if (impactElapsed >= 0 && !impactFiredRef.current) {
        impactFiredRef.current = true;
        onImpact?.();
      }

      if (impactProgress >= 1) {
        doneRef.current = true;
        if (headRef.current) headRef.current.visible = false;
        for (const tail of tailRefs.current) {
          if (tail) tail.visible = false;
        }
        if (fireballRef.current) fireballRef.current.visible = false;
        if (rippleRef.current) rippleRef.current.scale.setScalar(0);
        rippleMaterial.opacity = 0;
        for (const shard of shardRefs.current) {
          if (shard) shard.visible = false;
        }
        shardMaterial.opacity = 0;
        onComplete?.();
        return;
      }

      const head = headRef.current;

      // --- Flight (the comet streaks in and strikes) ---
      if (!reducedMotion) {
        if (flightProgress < 1) {
          // The comet flies from COMET_START_DISTANCE away along the
          // incoming direction, easing in (it accelerates as it dives); at
          // flightProgress 1 it is exactly at the impact point.
          const ease = flightProgress ** 1.8;
          const distance = COMET_START_DISTANCE * (1 - ease);
          if (head) {
            head.visible = true;
            head.position.set(
              incoming.x * distance,
              incoming.y * distance,
              incoming.z * distance
            );
            head.scale.setScalar(0.55 + 0.3 * flightProgress);
            headMaterial.opacity = 1;
          }
          // The tail trails the head along the flight line: each segment
          // sits a spacing behind the previous, shrinking and fading.
          tailRefs.current.forEach((tail, index) => {
            if (!tail) return;
            const offset = (index + 1) * TAIL_SPACING;
            tail.visible = true;
            tail.position.set(
              incoming.x * (distance + offset),
              incoming.y * (distance + offset),
              incoming.z * (distance + offset)
            );
            const fade = (TAIL_SEGMENTS - index) / TAIL_SEGMENTS;
            tail.scale.setScalar(TAIL_BASE_SCALE * fade * (0.7 + 0.3 * flightProgress));
            tailMaterials[index].opacity = TAIL_BASE_OPACITY * fade * (0.4 + 0.6 * flightProgress);
          });
        } else {
          // The instant of impact: the head flashes at the surface before
          // dissolving into the fireball.
          if (head) {
            head.visible = true;
            head.position.set(0, 0, 0);
            head.scale.setScalar(
              0.85 + 0.9 * Math.min(impactProgress / FIREBALL_FRACTION, 1)
            );
            headMaterial.opacity = Math.max(
              1 - impactProgress / FIREBALL_FRACTION,
              0
            );
          }
          for (const tail of tailRefs.current) {
            if (tail) tail.visible = false;
          }
        }
      } else {
        // Reduced motion: no comet, no flight.
        if (head) head.visible = false;
        for (const tail of tailRefs.current) {
          if (tail) tail.visible = false;
        }
      }

      // --- Impact (fireball + ripple + debris) ---
      if (impactElapsed >= 0) {
        // Reveal the portal at the strike (once, at the first impact frame).
        if (!impactFiredRef.current) {
          impactFiredRef.current = true;
          onImpact?.();
        }
        const fb = Math.min(impactProgress / FIREBALL_FRACTION, 1);
        const fbEase = 1 - (1 - fb) ** 2;
        if (fireballRef.current) {
          fireballRef.current.visible = true;
          fireballRef.current.scale.setScalar(0.5 + RIPPLE_RADIUS * 1.4 * fbEase);
          fireballMaterial.opacity = (1 - fb) * 0.95;
        }

        const ease = 1 - (1 - impactProgress) ** 3;
        if (rippleRef.current) {
          rippleRef.current.scale.setScalar(Math.max(RIPPLE_RADIUS * ease, 1e-4));
          rippleMaterial.opacity =
            (1 - impactProgress) ** 1.5 * RIPPLE_OPACITY;
        }

        if (!reducedMotion) {
          shardRefs.current.forEach((shard, index) => {
            if (!shard) return;
            const seed = seeds[index];
            const radius = 0.25 + ease * seed.travel;
            shard.visible = true;
            shard.position.set(
              Math.cos(seed.angle) * radius,
              ease * seed.rise,
              Math.sin(seed.angle) * radius
            );
            const spinAngle = impactElapsed * seed.spin + seed.phase;
            shard.rotation.set(spinAngle, spinAngle * 0.7, seed.phase);
            const grow = 0.5 + 0.8 * ease;
            const size = seed.scale * grow;
            shard.scale.set(size * 1.3, size, size * 0.8);
          });
          shardMaterial.opacity =
            impactProgress > 0.7 ? (1 - impactProgress) / 0.3 : 1;
        }
      }
    });

    return (
      <group ref={groupRef} position={position}>
        {/* The comet's head (a camera-facing hot core). */}
        <sprite ref={headRef} material={headMaterial} visible={false} raycast={() => null} />

        {/* The comet's tail (glow sprites trailing the head). */}
        {tailMaterials.map((material, index) => (
          <sprite
            key={`comet-tail-${index}`}
            ref={(el) => {
              if (el) tailRefs.current[index] = el;
            }}
            material={material}
            visible={false}
            raycast={() => null}
          />
        ))}

        {/* The impact fireball. */}
        <sprite ref={fireballRef} material={fireballMaterial} visible={false} raycast={() => null} />

        {/* The impact ripple (a faint ground ring). */}
        <mesh
          ref={rippleRef}
          geometry={sharedRingGeometry}
          material={rippleMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0}
          raycast={() => null}
        />

        {/* The impact debris (rock shards kicked out of the scorch). */}
        {seeds.map((_, index) => (
          <mesh
            key={`comet-shard-${index}`}
            ref={(el) => {
              if (el) shardRefs.current[index] = el;
            }}
            geometry={sharedShardGeometry}
            material={shardMaterial}
            visible={false}
            raycast={() => null}
          />
        ))}
      </group>
    );
  }
);

CometStrikeFX.displayName = "CometStrikeFX";
