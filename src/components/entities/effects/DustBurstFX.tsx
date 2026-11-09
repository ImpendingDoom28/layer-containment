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
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  RingGeometry,
  TetrahedronGeometry,
  type Group,
  type Mesh,
} from "three";

import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";

// The small dust burst a freshly placed tower kicks up on impact: a faint
// ground ring (dust settling outward) plus a handful of rock shards that pop
// out and tumble a little, then dissipate. It is timed with the placement
// drop (the `delay` matches the drop duration), so the dust lands exactly as
// the tower hits the ground. Everything runs on the pause-aware simulation
// clock by mutation (the burst freezes with the world on pause), so a
// placement costs no React state beyond mounting/unmounting this short-lived
// component.
const DUST_DURATION = 0.45;
// The settling ring spreads to a fixed radius (a touch past the base).
const RING_RADIUS = 0.75;
const RING_OPACITY = 0.25;
// The ring's inner edge as a fraction of its outer radius (matches the shared
// thin-band geometry): the band sits just outside the base, never under it.
const RING_INNER_FRACTION = 0.92;
// The outward shards: count, how far they travel from their spawn edge, how
// high they rise, and their size range. They spawn just outside the tower's
// base radius (never on the model), so the dust reads as ground being kicked
// up around the impact rather than through the tower.
const SHARD_COUNT = 9;
const SHARD_TRAVEL = 0.45;
const SHARD_RISE = 0.14;
const SHARD_SIZE_MIN = 0.04;
const SHARD_SIZE_MAX = 0.09;
// How far outside the base the shards spawn: a visible gap so the dust kicks
// up around the impact without covering the tower.
const SHARD_START_OFFSET = 0.25;
// How fast each shard tumbles (radians per second of burst), varied per shard
// so the debris never looks identical or spinning in sync.
const SHARD_SPIN_BASE = 5;
const SHARD_SPIN_SPREAD = 5;
// The shards are tinted around the dust colour with this amount of
// lightness variation (a darker and a lighter tone) so each reads as a
// separate piece of ground, not one flat grey smear.
const SHARD_TINT_JITTER = 0.16;

// One shared thin-band ring geometry (local XZ plane) for every dust burst's
// settling ring: a narrow annulus that hugs just outside the tower's base and
// sweeps outward (it never spreads under the model, so it reads as dust kicked
// up around the impact, not a disc through the tower). Each burst scales it out
// to its final radius, reusing the same buffers.
const sharedRingGeometry = new RingGeometry(0.92, 1, 32);

// One shared low-poly shard geometry (a faceted tetrahedron) for every dust
// shard. Flat shading (set per material) gives each face a hard edge, so the
// scene lights catch the facets and read as chunks of ground rather than one
// smooth blob. The per-shard non-uniform scale makes the chunks irregular.
const sharedShardGeometry = new TetrahedronGeometry(1);

// Deterministic per-shard variation (angle, rise, size, spin, tint) so every
// burst looks the same on every frame without per-frame random draws —
// Math.random would re-roll the values every render and pop the debris.
type ShardSeed = {
  angle: number;
  rise: number;
  scale: number;
  spin: number;
  phase: number;
  tint: Color;
};

const makeShardSeeds = (color: string): ShardSeed[] => {
  const base = new Color(color);
  const seeds: ShardSeed[] = [];
  for (let i = 0; i < SHARD_COUNT; i++) {
    const t = i / SHARD_COUNT;
    // A signed lightness offset (±SHARD_TINT_JITTER) so the shards vary
    // between a darker and a lighter tone of the dust colour.
    const tintJitter = SHARD_TINT_JITTER * ((((i * 37) % 10) / 10) - 0.5) * 2;
    seeds.push({
      // Evenly spaced around the base with a per-shard angular offset so the
      // debris scatters instead of reading as a ring of points.
      angle: t * Math.PI * 2 + ((i * 13) % 7) * 0.13,
      rise: 0.5 + 0.5 * (((i * 53) % 10) / 10),
      scale: SHARD_SIZE_MIN + (SHARD_SIZE_MAX - SHARD_SIZE_MIN) * (((i * 29) % 10) / 10),
      spin: SHARD_SPIN_BASE + SHARD_SPIN_SPREAD * (((i * 41) % 10) / 10),
      phase: (i * 0.7) % (Math.PI * 2),
      tint: base.clone().offsetHSL(0, 0, tintJitter),
    });
  }
  return seeds;
};

// Fast start, decelerating — debris pops out quickly then slows as it settles.
const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3;

type DustBurstFXProps = {
  /** World-space point on the planet surface the dust rises from (the tower base). */
  position: [number, number, number];
  /** Surface normal at the point as a quaternion (the group's local +Y). */
  quaternion: Quaternion;
  /** Tints the shards and ring (the dust colour, e.g. the tile base). */
  color: string;
  /**
   * The tower's base radius: the ring and shards start just outside it so the
   * dust never overlaps the model (dust kicks up around the impact, not
   * through the tower).
   */
  baseRadius?: number;
  /** The settle duration once the burst begins (after the delay). */
  duration?: number;
  /** Seconds to wait (invisible) before the burst begins — timed to the drop's impact. */
  delay?: number;
  onComplete?: () => void;
};

export const DustBurstFX: FC<DustBurstFXProps> = memo(
  ({
    position,
    quaternion,
    color,
    baseRadius = 0.3,
    duration = DUST_DURATION,
    delay = 0,
    onComplete,
  }) => {
    const { getSimulationTime } = useSimulationClock();
    const reducedMotion = useReducedMotion();

    const groupRef = useRef<Group>(null);
    const ringRef = useRef<Mesh>(null);
    const shardRefs = useRef<(Mesh | null)[]>([]);
    const startTimeRef = useRef<number | null>(null);
    const doneRef = useRef(false);

    // Lie the group flat on the planet surface (local +Y = surface normal),
    // applied imperatively so the group's own quaternion is copied, not
    // assigned a cross-instance object to a read-only property.
    useLayoutEffect(() => {
      groupRef.current?.quaternion.copy(quaternion);
    }, [quaternion]);

    const seeds = useMemo(() => makeShardSeeds(color), [color]);

    const ringMaterial = useMemo(
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

    // A lit material per shard, tinted with its tone. MeshStandardMaterial
    // picks up the scene's hemisphere/key/rim lights and shadows like the tiles
    // and rocks (a SpriteMaterial could not — that was the flat, unlit "super
    // gray" look); flatShading catches the facet edges.
    const shardMaterials = useMemo(
      () =>
        seeds.map((seed) =>
          new MeshStandardMaterial({
            color: seed.tint,
            roughness: 0.9,
            metalness: 0,
            flatShading: true,
            transparent: true,
            opacity: 0,
          })
        ),
      [seeds]
    );

    useLayoutEffect(
      () => () => {
        ringMaterial.dispose();
        for (const material of shardMaterials) material.dispose();
      },
      [ringMaterial, shardMaterials]
    );

    // Reset the burst's transform if it is unmounted mid-flight (a scene
    // transition), so no leftover pose leaks into the next scene.
    useEffect(() => {
      const ring = ringRef.current;
      const shards = shardRefs.current;
      return () => {
        if (ring) ring.scale.setScalar(0);
        for (const shard of shards) {
          if (shard) shard.visible = false;
        }
      };
    }, []);

    useFrame((state) => {
      if (doneRef.current) return;
      startTimeRef.current ??= getSimulationTime(state.clock.elapsedTime);
      const elapsed =
        getSimulationTime(state.clock.elapsedTime) - startTimeRef.current;

      // Wait for the drop's impact before puffing.
      if (elapsed < delay) return;
      const progress = Math.min((elapsed - delay) / duration, 1);
      const ease = easeOutCubic(progress);

      // The ring is a thin annulus whose inner edge sits exactly on the base
      // radius (never under the model) and sweeps out to a fixed radius.
      const ringInnerEdge = baseRadius;
      const ringStart = ringInnerEdge / RING_INNER_FRACTION;
      const ringRadius = ringStart + (RING_RADIUS - ringStart) * ease;
      if (reducedMotion) {
        // No motion: a brief static fade of the ring only.
        if (ringRef.current) {
          ringRef.current.scale.setScalar(Math.max(ringRadius, 1e-4));
          ringMaterial.opacity = (1 - progress) * RING_OPACITY;
        }
      } else {
        if (ringRef.current) {
          ringRef.current.scale.setScalar(Math.max(ringRadius, 1e-4));
          ringMaterial.opacity = (1 - progress) * RING_OPACITY;
        }
        shardRefs.current.forEach((shard, index) => {
          if (!shard) return;
          const seed = seeds[index];
          // Shards spawn a clear gap outside the base radius, so they never
          // cover the model, and travel outward from there.
          const radius = baseRadius + SHARD_START_OFFSET + ease * SHARD_TRAVEL;
          shard.visible = true;
          shard.position.set(
            Math.cos(seed.angle) * radius,
            ease * SHARD_RISE * seed.rise,
            Math.sin(seed.angle) * radius
          );
          // Tumble as the debris tumbles (a per-shard spin, phase-seeded).
          const spinAngle = (elapsed - delay) * seed.spin + seed.phase;
          shard.rotation.set(spinAngle, spinAngle * 0.7, seed.phase);
          // Grow out of the kick, then settle back to a small resting size.
          const grow = 0.5 + 0.8 * ease;
          const size = seed.scale * grow;
          // Non-uniform scale so each chunk reads as an irregular rock.
          shard.scale.set(size * 1.3, size, size * 0.8);
        });
        // The shards stay opaque while they fly (the debris is solid) and
        // dissipate with the ring once it is gone.
        for (const material of shardMaterials) {
          material.opacity = progress > 0.85 ? (1 - progress) / 0.15 : 1;
        }
      }

      if (progress >= 1) {
        doneRef.current = true;
        if (ringRef.current) ringRef.current.scale.setScalar(0);
        ringMaterial.opacity = 0;
        for (const material of shardMaterials) material.opacity = 0;
        for (const shard of shardRefs.current) {
          if (shard) shard.visible = false;
        }
        onComplete?.();
      }
    });

    return (
      <group ref={groupRef} position={position}>
        <mesh
          ref={ringRef}
          geometry={sharedRingGeometry}
          material={ringMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0}
          raycast={() => null}
        />
        {seeds.map((_, index) => (
          <mesh
            key={`shard-${index}`}
            ref={(el) => {
              shardRefs.current[index] = el;
            }}
            geometry={sharedShardGeometry}
            material={shardMaterials[index]}
            visible={false}
            raycast={() => null}
          />
        ))}
      </group>
    );
  }
);

DustBurstFX.displayName = "DustBurstFX";
