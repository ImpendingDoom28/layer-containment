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
  IcosahedronGeometry,
  RingGeometry,
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
// The outward shards: how many pop out of each burst. Their motion is
// randomized per burst (direction, travel distance, rise, spin, size, tint) so
// no two placements look alike — a fixed, symmetric scatter reads as a
// predictable spray. They spawn just outside the tower's base radius (never
// on the model), so the dust reads as ground being kicked up around the
// impact rather than through the tower.
const SHARD_COUNT = 9;
// The travel distance of a shard, randomized between these bounds (world
// units from its spawn edge).
const SHARD_TRAVEL_MIN = 0.28;
const SHARD_TRAVEL_MAX = 0.62;
// How high a shard rises, randomized between these bounds.
const SHARD_RISE_MIN = 0.06;
const SHARD_RISE_MAX = 0.16;
// A shard's radius, randomized between these bounds.
const SHARD_SIZE_MIN = 0.04;
const SHARD_SIZE_MAX = 0.09;
// How far outside the base the shards spawn: a visible gap so the dust kicks
// up around the impact without covering the tower.
const SHARD_START_OFFSET = 0.25;
// How fast each shard tumbles (radians per second of burst), randomized per
// shard so the debris never looks identical or spinning in sync.
const SHARD_SPIN_MIN = 2.5;
const SHARD_SPIN_MAX = 7.5;
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

// One shared low-poly shard geometry (a geodesic sphere) for every dust
// shard: the "orthodox" pebble/rock shape. Flat shading (set per material)
// gives each face a hard edge, so the scene lights catch the facets and the
// chunks read as little stones kicked up by the impact rather than smooth
// blobs or jagged shards.
const sharedShardGeometry = new IcosahedronGeometry(1, 0);

// The dust uses two material programs no other scene object compiles (a
// flat-shaded, transparent MeshStandardMaterial for the shards and an
// additive, double-sided MeshBasicMaterial for the ring). A burst only mounts
// at a placement, so without this stand-in the first placement would pay a
// one-time shader-compile stall on its impact frame. These hidden stand-ins
// keep both programs in the scene at all times, so the scene's ShaderReadyGate
// (gl.compileAsync walks the full graph, including hidden objects) compiles
// them during the loading screen and the first placement renders hitch-free.
// The materials are app-lifetime singletons (never disposed) like the rubble
// fallback; their colour is irrelevant to the compiled program.
let prewarmRingMaterial: MeshBasicMaterial | null = null;
const getPrewarmRingMaterial = (): MeshBasicMaterial => {
  if (!prewarmRingMaterial) {
    prewarmRingMaterial = new MeshBasicMaterial({
      color: "#808080",
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
  }
  return prewarmRingMaterial;
};

let prewarmShardMaterial: MeshStandardMaterial | null = null;
const getPrewarmShardMaterial = (): MeshStandardMaterial => {
  if (!prewarmShardMaterial) {
    prewarmShardMaterial = new MeshStandardMaterial({
      color: "#808080",
      roughness: 0.9,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: 0,
    });
  }
  return prewarmShardMaterial;
};

// A hidden group (never drawn) that keeps the dust's two material programs
// mounted for the whole scene so they are precompiled at load, not on the
// first burst's frame.
export const DustBurstPrewarm: FC = () => (
  <group visible={false}>
    <mesh
      geometry={sharedRingGeometry}
      material={getPrewarmRingMaterial()}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
    />
    <mesh
      geometry={sharedShardGeometry}
      material={getPrewarmShardMaterial()}
      raycast={() => null}
    />
  </group>
);

DustBurstPrewarm.displayName = "DustBurstPrewarm";

// A random value in [min, max).
const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

// Per-burst randomized shard variation (direction, travel, rise, size, spin,
// tint) so no two placements look alike. This runs once per burst mount (the
// component's useMemo is keyed on the stable colour), so the random roll is
// taken exactly once per placement — never re-rolled per frame.
type ShardSeed = {
  angle: number;
  travel: number;
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
    // A signed lightness offset (±SHARD_TINT_JITTER) so the shards vary
    // between a darker and a lighter tone of the dust colour.
    const tintJitter = SHARD_TINT_JITTER * (Math.random() - 0.5) * 2;
    seeds.push({
      // A random direction around the base, so the debris scatters in all
      // directions rather than an even ring of points.
      angle: rand(0, Math.PI * 2),
      travel: rand(SHARD_TRAVEL_MIN, SHARD_TRAVEL_MAX),
      rise: rand(SHARD_RISE_MIN, SHARD_RISE_MAX),
      scale: rand(SHARD_SIZE_MIN, SHARD_SIZE_MAX),
      spin: rand(SHARD_SPIN_MIN, SHARD_SPIN_MAX),
      phase: rand(0, Math.PI * 2),
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
          // cover the model, and travel outward from there — each with its own
          // random direction and distance, so no two bursts spray alike.
          const radius =
            baseRadius + SHARD_START_OFFSET + ease * seed.travel;
          shard.visible = true;
          shard.position.set(
            Math.cos(seed.angle) * radius,
            ease * seed.rise,
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
