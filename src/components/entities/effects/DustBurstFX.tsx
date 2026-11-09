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

// The small dust burst a freshly placed tower kicks up on impact: a faint
// ground ring (dust settling outward) plus a handful of soft puffs that pop
// out and rise a little, then dissipate. It is timed with the placement drop
// (the `delay` matches the drop duration), so the dust lands exactly as the
// tower hits the ground. Everything runs on the pause-aware simulation clock
// by mutation (the burst freezes with the world on pause), so a placement
// costs no React state beyond mounting/unmounting this short-lived component.
const DUST_DURATION = 0.45;
// The settling ring spreads to a fixed radius (a touch past the base).
const RING_RADIUS = 0.75;
const RING_OPACITY = 0.25;
// The ring's inner edge as a fraction of its outer radius (matches the shared
// thin-band geometry): the band sits just outside the base, never under it.
const RING_INNER_FRACTION = 0.92;
// The outward puffs: count, how far they travel from their spawn edge, how
// high they rise, and their rest size. They spawn just outside the tower's
// base radius (never on the model), so the dust reads as being kicked up
// around the impact rather than through the tower.
const PUFF_COUNT = 6;
const PUFF_TRAVEL = 0.45;
const PUFF_RISE = 0.14;
const PUFF_SIZE = 0.16;
const PUFF_OPACITY = 0.55;
// How far outside the base the puffs spawn: a visible gap so the dust kicks up
// around the impact without covering the tower.
const PUFF_START_OFFSET = 0.25;

// One shared thin-band ring geometry (local XZ plane) for every dust burst's
// settling ring: a narrow annulus that hugs just outside the tower's base and
// sweeps outward (it never spreads under the model, so it reads as dust kicked
// up around the impact, not a disc through the tower). Each burst scales it out
// to its final radius, reusing the same buffers.
const sharedRingGeometry = new RingGeometry(0.92, 1, 32);

// One shared radial-gradient puff (white core fading to transparent) for every
// dust puff; tinted per burst. Lazily created so importing this module in a
// DOM-less (node) test environment never touches `document`.
let dustTexture: CanvasTexture | null = null;
const getDustTexture = (): CanvasTexture | null => {
  if (dustTexture) return dustTexture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.4, "rgba(255,255,255,0.4)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  dustTexture = new CanvasTexture(canvas);
  return dustTexture;
};

// Fast start, decelerating — dust puffs out quickly then slows as it settles.
const easeOutCubic = (p: number): number => 1 - (1 - p) ** 3;

type DustBurstFXProps = {
  /** World-space point on the planet surface the dust rises from (the tower base). */
  position: [number, number, number];
  /** Surface normal at the point as a quaternion (the group's local +Y). */
  quaternion: Quaternion;
  /** Tints the puffs and ring (a neutral dust colour). */
  color: string;
  /**
   * The tower's base radius: the ring and puffs start just outside it so the
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
    const puffRefs = useRef<(Sprite | null)[]>([]);
    const startTimeRef = useRef<number | null>(null);
    const doneRef = useRef(false);

    // Lie the group flat on the planet surface (local +Y = surface normal),
    // applied imperatively so the group's own quaternion is copied, not
    // assigned a cross-instance object to a read-only property.
    useLayoutEffect(() => {
      groupRef.current?.quaternion.copy(quaternion);
    }, [quaternion]);

    const tint = useMemo(
      () => new Color("#ffffff").lerp(new Color(color), 0.5),
      [color]
    );

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

    const puffMaterial = useMemo(
      () =>
        new SpriteMaterial({
          map: getDustTexture(),
          color: tint,
          transparent: true,
          opacity: 0,
          blending: AdditiveBlending,
          depthWrite: false,
        }),
      [tint]
    );

    useLayoutEffect(
      () => () => {
        ringMaterial.dispose();
        puffMaterial.dispose();
      },
      [ringMaterial, puffMaterial]
    );

    // Reset the burst's transform if it is unmounted mid-flight (a scene
    // transition), so no leftover pose leaks into the next scene.
    useEffect(() => {
      const ring = ringRef.current;
      const puffs = puffRefs.current;
      return () => {
        if (ring) ring.scale.setScalar(0);
        for (const puff of puffs) {
          if (puff) puff.visible = false;
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
        puffRefs.current.forEach((puff, index) => {
          if (!puff) return;
          const angle = (index / PUFF_COUNT) * Math.PI * 2;
          // Puffs spawn a clear gap outside the base radius, so they never
          // cover the model, and travel outward from there.
          const radius = baseRadius + PUFF_START_OFFSET + ease * PUFF_TRAVEL;
          puff.visible = true;
          puff.position.set(
            Math.cos(angle) * radius,
            ease * PUFF_RISE,
            Math.sin(angle) * radius
          );
          puff.scale.setScalar(PUFF_SIZE * (0.6 + 0.8 * ease));
        });
        puffMaterial.opacity = (1 - progress) * PUFF_OPACITY;
      }

      if (progress >= 1) {
        doneRef.current = true;
        if (ringRef.current) ringRef.current.scale.setScalar(0);
        ringMaterial.opacity = 0;
        puffMaterial.opacity = 0;
        for (const puff of puffRefs.current) {
          if (puff) puff.visible = false;
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
        {Array.from({ length: PUFF_COUNT }, (_, index) => (
          <sprite
            key={`puff-${index}`}
            ref={(el) => {
              puffRefs.current[index] = el;
            }}
            material={puffMaterial}
            scale={PUFF_SIZE}
            visible={false}
            raycast={() => null}
          />
        ))}
      </group>
    );
  }
);

DustBurstFX.displayName = "DustBurstFX";
