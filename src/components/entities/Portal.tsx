import { FC, useRef, useEffect, useMemo, memo } from "react";
import { useFrame } from "@react-three/fiber";
import { Color } from "three";
import type { Group, Mesh, MeshStandardMaterial, Quaternion } from "three";

import { useSimulationClock } from "../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../core/hooks/useReducedMotion";
import { getCssColorValue } from "../ui/lib/cssUtils";

// How far toward orange a fully stacked (tier 3) Reinforcements portal shifts.
// 1 keeps a clear green base, 3 reads as hot orange.
const REINFORCEMENT_TINT_MAX = 0.85;
const ORANGE_TINT = new Color("#f59e0b");

// The portal's entrance: after the level's comet strikes the ground, the
// portal grows out of the rock over this window (ease-out, from a collapsed
// pose) while its rings spin up fast, so the opening reads as a fresh crack
// in the surface rather than a pre-existing fixture. The reveal starts when
// the comet impacts (the entry phase flips to `revealed`); without an entry
// (e.g. a showcase portal) the portal stays at rest.
const ENTRY_DURATION = 1.0;

/** Maps the Reinforcements tier (0-3) to a green->orange lerp factor. */
const getReinforcementTint = (tier: number): number =>
  (Math.min(Math.max(tier, 0), 3) / 3) * REINFORCEMENT_TINT_MAX;

type PortalProps = {
  position: [number, number, number];
  pathYaw?: number;
  quaternion?: Quaternion;
  surfaceNormal?: [number, number, number];
  /** Reinforcements tier picked for the run (0 = none); tints the portal orange. */
  reinforcementsTier?: number;
  /**
   * The portal's comet reveal, when it participates in one. `phase` is a
   * small state machine: `armed` = the comet is still in flight, so the
   * portal is hidden (the rock it cracks open isn't open yet); `revealed` =
   * the comet has struck, so the portal grows out of the scorch. `run` is a
   * per-load counter so a restart replays the reveal even on the same level.
   * `null` is a portal at rest (showcase / editor / a scene with no comet).
   */
  entry?: { run: number; phase: "armed" | "revealed" } | null;
};

export const Portal: FC<PortalProps> = memo(
  ({
    position,
    pathYaw = 0,
    quaternion,
    surfaceNormal,
    reinforcementsTier = 0,
    entry,
  }) => {
    const outerRingRef = useRef<Mesh>(null);
    const middleRingRef = useRef<Mesh>(null);
    const innerRingRef = useRef<Mesh>(null);
    const portalCoreRef = useRef<Mesh>(null);
    const particlesRef = useRef<(Mesh | null)[]>([]);
    const groupRef = useRef<Group>(null);
    const indicatorRefs = useRef<(Mesh | null)[]>([]);
    const animTimeRef = useRef(0);
    // A separate clock for the entrance (the comet reveal). It runs on the
    // same pause-aware time scale so the reveal slows into stillness with the
    // world, but it must not feed the portal's idle animation: `animTime`
    // keeps growing for the portal's lifetime, while the entrance progress is
    // clamped to [0, 1] and then settles. It only advances once the comet has
    // struck (phase `revealed`); while the comet is still in flight
    // (phase `armed`) the portal is hidden and the clock is held at 0.
    const entryTimeRef = useRef(0);
    const lastRunRef = useRef(-1);
    // The rings' accumulated rotation, one per ring. The rings spin fast
    // while the portal opens and settle to their idle rate, so each ring's
    // angle is advanced by `dt * currentSpeed` (integrating the changing
    // speed) rather than `time * speed` — the latter makes the angle jump
    // backwards when the speed changes (it shrinks as `idleBlend` rises), even
    // though the ring keeps turning.
    const outerRingAngleRef = useRef(0);
    const middleRingAngleRef = useRef(0);
    const innerRingAngleRef = useRef(0);

    // The portal is decorative motion, so drive it with the shared
    // pause-aware simulation clock: its rings, core pulse, and particles slow
    // into stillness (and freeze) while the game is paused, matching the rest
    // of the world.
    const { getTimeScale } = useSimulationClock();
    const reducedMotion = useReducedMotion();

    useEffect(() => {
      particlesRef.current = Array.from({ length: 12 }, () => null);
    }, []);

    useFrame((_, delta) => {
      const dt = delta * getTimeScale();
      animTimeRef.current += dt;
      const time = animTimeRef.current;

      // The comet reveal: while the comet is still in flight (phase `armed`)
      // the portal is hidden and its clock is held; once the comet strikes
      // (phase `revealed`) the clock runs and the portal grows out of the
      // scorch. A new run (a bumped `run`) re-arms the reveal from zero.
      if (entry) {
        if (lastRunRef.current !== entry.run) {
          lastRunRef.current = entry.run;
          entryTimeRef.current = 0;
        }
        if (entry.phase === "revealed") {
          entryTimeRef.current += dt;
        }
      } else {
        lastRunRef.current = -1;
      }
      const armed = entry?.phase === "armed";
      // The reveal progress (eased out) and how much of the idle animation is
      // allowed (it fades in over the reveal, so the portal is calm right
      // after the strike and picks up its perpetual motion afterward). With
      // no reveal (or under `prefers-reduced-motion`) the portal is at rest.
      const entryProgress = Math.min(entryTimeRef.current / ENTRY_DURATION, 1);
      const entryEase =
        entry && !armed
          ? reducedMotion
            ? 1
            : 1 - (1 - entryProgress) ** 3
          : 1;
      // How much of the idle (perpetual) animation is allowed: it fades in
      // over the reveal, so the portal is calm right after the strike and
      // picks up its perpetual motion afterward. Under reduced motion the
      // reveal is instant, so the portal is at its resting blend too (no
      // entrance spin). With no reveal the portal is at rest.
      const idleBlend =
        entry && !armed && !reducedMotion
          ? Math.max(0, Math.min((entryTimeRef.current - ENTRY_DURATION) / 0.6, 1))
          : 1;

      // Advance each ring by its current speed this frame (see `outerRingAngleRef`
      // and siblings): the spin-up speed eases into the idle speed as
      // `idleBlend` rises, and integrating `dt * speed` keeps the angle
      // monotonic through that change.
      const outerSpeed = 0.8 * idleBlend + 2.4 * (1 - idleBlend);
      const middleSpeed = 1.2 * idleBlend + 3.2 * (1 - idleBlend);
      const innerSpeed = 1.5 * idleBlend + 4.0 * (1 - idleBlend);
      outerRingAngleRef.current += dt * outerSpeed;
      middleRingAngleRef.current += dt * middleSpeed;
      innerRingAngleRef.current += dt * innerSpeed;
      if (outerRingRef.current)
        outerRingRef.current.rotation.y = outerRingAngleRef.current;
      if (middleRingRef.current)
        middleRingRef.current.rotation.y = -middleRingAngleRef.current;
      if (innerRingRef.current)
        innerRingRef.current.rotation.y = innerRingAngleRef.current;

      if (portalCoreRef.current) {
        const pulse = Math.sin(time * 2) * 0.1 * idleBlend + 1;
        portalCoreRef.current.scale.set(
          pulse * (0.4 + 0.6 * entryEase),
          pulse * (0.4 + 0.6 * entryEase),
          pulse * (0.4 + 0.6 * entryEase)
        );
        const material = portalCoreRef.current
          .material as MeshStandardMaterial;
        material.emissiveIntensity =
          (0.3 + Math.sin(time * 3) * 0.2 * idleBlend) *
          (0.35 + 0.65 * entryEase);
      }

      particlesRef.current.forEach((particle, index) => {
        if (!particle) return;
        const angle =
          (index / particlesRef.current.length) * Math.PI * 2 + time;
        const radius =
          (0.4 + Math.sin(time * 2 + index) * 0.1 * idleBlend) *
          (0.4 + 0.6 * entryEase);
        particle.position.x = Math.cos(angle) * radius;
        particle.position.z = Math.sin(angle) * radius;
        particle.position.y =
          Math.sin(time * 1.5 + index * 0.5) * 0.2 * idleBlend * entryEase;

        particle.rotation.y = time * 2 + index;
        particle.rotation.x = time * 1.5;
      });

      // Reinforcements tier rings: a gentle pulse marks how many extra
      // enemies the portal will throw, growing outward from the core.
      for (let i = 0; i < indicatorRefs.current.length; i++) {
        const indicator = indicatorRefs.current[i];
        if (!indicator) continue;
        const phase = ((time * 1.6 - i * 0.35) % 1 + 1) % 1;
        const scale = (0.5 + phase * 0.45) * (0.4 + 0.6 * entryEase);
        indicator.scale.setScalar(scale);
        (indicator.material as MeshStandardMaterial).opacity =
          0.5 * (1 - phase) * entryEase;
      }

      if (groupRef.current) {
        // While the comet is still in flight the portal is hidden: the rock
        // it grows from hasn't been struck yet, so nothing shows until the
        // impact flips the phase to `revealed`.
        groupRef.current.visible = !armed;
        const idlePulse = Math.sin(time * 1.2) * 0.05 * idleBlend;
        // The group grows out of the rock: at the start it lies squashed flat
        // against the surface (the ring hugging the ground) and rises to its
        // rest height over the reveal, so the portal reads as a fresh opening
        // in the rock the comet just cracked open.
        const rise = 0.4 + 0.6 * entryEase;
        const lift = idlePulse + (rise - 1) * 0.8;
        if (surfaceNormal) {
          const [nx, ny, nz] = surfaceNormal;
          groupRef.current.position.set(
            position[0] + nx * lift,
            position[1] + ny * lift,
            position[2] + nz * lift
          );
        } else {
          groupRef.current.position.y = position[1] + lift;
        }
        groupRef.current.scale.set(
          rise,
          Math.max(rise * 0.55, 1e-3),
          rise
        );
      }
    });

    const reinforcementTier = Math.min(Math.max(reinforcementsTier, 0), 3);
    const tint = getReinforcementTint(reinforcementTier);

    // The portal's emissive drives its glow: keep the base colour on the
    // green scene identity and lerp the emissive toward orange as the
    // Reinforcements stack grows, so the portal itself warms up with the
    // upgrade. The emissive material is not shared across tiers, so the
    // per-tier tint never churns the cached base materials.
    const portalColor = getCssColorValue("scene-portal");
    const portalGlow = useMemo(
      () => new Color(getCssColorValue("scene-portal-glow")).lerp(ORANGE_TINT, tint),
      [tint]
    );

    return (
      <group
        ref={groupRef}
        position={position}
        // Hidden on the first render too while the comet is in flight, so
        // the portal never flashes before the first `useFrame` hides it.
        visible={!(entry && entry.phase === "armed")}
        {...(quaternion
          ? { quaternion }
          : { rotation: [0, pathYaw + Math.PI / 2, 0] as [number, number, number] })}
      >
        <mesh ref={outerRingRef}>
          <torusGeometry args={[0.4, 0.04, 16, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.6}
            transparent
            opacity={0.8}
          />
        </mesh>

        <mesh ref={middleRingRef}>
          <torusGeometry args={[0.3, 0.03, 16, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.5}
            transparent
            opacity={0.7}
          />
        </mesh>

        <mesh ref={innerRingRef}>
          <torusGeometry args={[0.2, 0.02, 16, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.7}
            transparent
            opacity={0.9}
          />
        </mesh>

        <mesh ref={portalCoreRef} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 32]} />
          <meshStandardMaterial
            color={portalColor}
            emissive={portalGlow}
            emissiveIntensity={0.3}
            transparent
            opacity={0.6}
          />
        </mesh>

        {particlesRef.current.map((_, index) => (
          <mesh
            key={`portal-particle-${index}`}
            ref={(el) => {
              if (el) particlesRef.current[index] = el;
            }}
          >
            <sphereGeometry args={[0.03, 8, 8]} />
            <meshStandardMaterial
              color={portalColor}
              emissive={portalGlow}
              emissiveIntensity={1}
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}

        {reinforcementTier > 0 &&
          Array.from({ length: reinforcementTier }, (_, index) => (
            <mesh
              key={`reinforcement-tier-${index}`}
              ref={(el) => {
                if (el) indicatorRefs.current[index] = el;
              }}
              position={[0, 0.06, 0]}
            >
              <torusGeometry args={[0.52, 0.02, 8, 40]} />
              <meshStandardMaterial
                color={portalGlow}
                emissive={portalGlow}
                emissiveIntensity={1}
                transparent
                opacity={0.4}
                depthWrite={false}
              />
            </mesh>
          ))}

        <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.45, 0.45, 0.05, 16]} />
          <meshStandardMaterial
            color={getCssColorValue("scene-gray-700")}
            emissive={getCssColorValue("scene-gray-800")}
            emissiveIntensity={0.1}
          />
        </mesh>
      </group>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.position[0] === nextProps.position[0] &&
      prevProps.position[1] === nextProps.position[1] &&
      prevProps.position[2] === nextProps.position[2] &&
      (prevProps.pathYaw ?? 0) === (nextProps.pathYaw ?? 0) &&
      prevProps.quaternion === nextProps.quaternion &&
      prevProps.surfaceNormal === nextProps.surfaceNormal &&
      prevProps.reinforcementsTier === nextProps.reinforcementsTier &&
      prevProps.entry?.run === nextProps.entry?.run &&
      prevProps.entry?.phase === nextProps.entry?.phase
    );
  }
);

Portal.displayName = "Portal";
