import { useFrame } from "@react-three/fiber";
import { FC, memo, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  CanvasTexture,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type Group,
  type Mesh,
} from "three";
import type { Entity } from "koota";

import {
  enemyUpgradesSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { Position } from "../../../core/ecs/traits/position";
import type {
  EnemyUpgradeId,
  EnemyUpgradeStack,
} from "../../../core/types/game";

import { EmissiveParticleSphere } from "./primitives/EmissiveParticleSphere";
import {
  GLOW_SHELL_GEOMETRY,
  REGEN_RING_GEOMETRY,
  SHIELD_PLATE_GEOMETRY,
  STRAP_PLANE_GEOMETRY,
} from "./primitives/UpgradeVisualGeometries";
import type { EnemyAttachedEffectProps } from "./types";

type UpgradeEffectProps = EnemyAttachedEffectProps & {
  entity: Entity;
  enemySize: number;
  upgradeStacks: EnemyUpgradeStack[];
};

const FALLBACK_COLOR = "#ffffff";
const REGEN_PARTICLE_BASE = 3;
const REGEN_RING_SCALE_BASE = 1.1;
const REGEN_RING_SCALE_STEP = 0.15;

/**
 * White-to-transparent fade along the strap length (u=0 is the tail, u=1 the
 * head), so the ribbon melts out behind the enemy. Built once in the browser;
 * in node (RTTR) `document` is absent and the map is simply omitted.
 */
const createStrapFadeTexture = (): CanvasTexture | null => {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 8;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, 64, 0);
  // u=0 is the far tail, u=1 the head (inside the body). Solid from just
  // behind the body out to a soft point at the far tail, so the ribbon reads
  // clearly from the top-down camera.
  gradient.addColorStop(0, "rgba(255,255,255,0)");
  gradient.addColorStop(0.35, "rgba(255,255,255,1)");
  gradient.addColorStop(1, "rgba(255,255,255,1)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 8);
  return new CanvasTexture(canvas);
};

const STRAP_FADE_TEXTURE = createStrapFadeTexture();

// One material per (color, opacity, intensity): every enemy sharing an
// upgrade picks the same compiled program; per-enemy animation lives on the
// meshes (scale/position/quaternion), never on the shared material.
const materialCache = new Map<string, MeshStandardMaterial>();
const getEmissiveMaterial = (
  color: string,
  opacity: number,
  emissiveIntensity: number
): MeshStandardMaterial => {
  const key = `${color}|${opacity}|${emissiveIntensity}`;
  let material = materialCache.get(key);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    materialCache.set(key, material);
  }
  return material;
};

// All swift straps are white, so a single shared additive material. The fade
// map is omitted in node (no canvas) where the straps render solid.
const STRAP_MATERIAL = new MeshBasicMaterial({
  color: "#ffffff",
  transparent: true,
  opacity: 0.4,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide,
});
if (STRAP_FADE_TEXTURE) STRAP_MATERIAL.map = STRAP_FADE_TEXTURE;

const WORLD_UP = new Vector3(0, 1, 0);
const tmpDir = new Vector3();
const tmpPerp = new Vector3();
const tmpMatrix = new Matrix4();
const tmpQuat = new Quaternion();

type EffectLayout = {
  hasShield: boolean;
  shieldTier: number;
  shieldColor: string;
  hasGlow: boolean;
  glowScale: number;
  glowOpacity: number;
  glowColor: string;
  hasRegen: boolean;
  regenTier: number;
  regenParticleCount: number;
  regenColor: string;
  hasSwift: boolean;
  swiftTier: number;
};

const buildEffectLayout = (
  upgradeStacks: EnemyUpgradeStack[],
  upgradeConfigs:
    Record<EnemyUpgradeId, { indicatorColor: string }> | null | undefined
): EffectLayout => {
  const colorOf = (id: EnemyUpgradeId) =>
    upgradeConfigs?.[id]?.indicatorColor ?? FALLBACK_COLOR;
  const layout: EffectLayout = {
    hasShield: false,
    shieldTier: 0,
    shieldColor: FALLBACK_COLOR,
    hasGlow: false,
    glowScale: 1,
    glowOpacity: 0,
    glowColor: FALLBACK_COLOR,
    hasRegen: false,
    regenTier: 0,
    regenParticleCount: 0,
    regenColor: FALLBACK_COLOR,
    hasSwift: false,
    swiftTier: 0,
  };
  for (const stack of upgradeStacks) {
    switch (stack.id) {
      case "armored":
        layout.hasShield = true;
        layout.shieldTier = stack.tier;
        layout.shieldColor = colorOf(stack.id);
        break;
      case "slowResistance":
        layout.hasGlow = true;
        layout.glowScale = 1.16 + (stack.tier - 1) * 0.06;
        layout.glowOpacity = 0.12 + stack.tier * 0.03;
        layout.glowColor = colorOf(stack.id);
        break;
      case "regenerating":
        layout.hasRegen = true;
        layout.regenTier = stack.tier;
        layout.regenParticleCount = REGEN_PARTICLE_BASE + (stack.tier - 1);
        layout.regenColor = colorOf(stack.id);
        break;
      case "swift":
        layout.hasSwift = true;
        layout.swiftTier = stack.tier;
        break;
      default:
        break;
    }
  }
  return layout;
};

/**
 * Physical upgrade visuals anchored to the enemy (no floating icons):
 *
 * - Armored: small 3D shield plates standing on the ground in front of the
 *   body (1/2/3 per tier).
 * - Unstoppable: a shallow purple glow shell hugging the body; the higher the
 *   tier, the wider and brighter the halo.
 * - Regenerating: a green disc on the ground emitting a stream of green
 *   particles that rise and fade out.
 * - Swift: white speed straps trailing behind the enemy along its travel
 *   direction (1/2/3 per tier).
 */
export const UpgradeEffect: FC<UpgradeEffectProps> = memo(
  ({ entity, enemySize, upgradeStacks, getTimeScale }) => {
    const enemyUpgrades = useGameStore(enemyUpgradesSelector);
    const timeRef = useRef(0);
    const prevPosRef = useRef<{ x: number; y: number; z: number } | null>(null);
    const dirRef = useRef(new Vector3(0, 0, -1));
    const dirGroupRef = useRef<Group>(null);
    const glowRef = useRef<Mesh>(null);
    const ringRef = useRef<Mesh>(null);
    const strapRefs = useRef<(Mesh | null)[]>([]);
    const particleRefs = useRef<(Mesh | null)[]>([]);

    const layout = useMemo(
      () => buildEffectLayout(upgradeStacks, enemyUpgrades),
      [upgradeStacks, enemyUpgrades]
    );

    useFrame((_, delta) => {
      const scaledDelta = delta * getTimeScale();
      timeRef.current += scaledDelta;
      const time = timeRef.current;

      // Smooth the travel direction from the Position trait (the movement
      // system advances it before this frame mirrors it onto the mesh).
      const pos = entity.get(Position);
      if (pos) {
        const prev = prevPosRef.current;
        if (prev) {
          tmpDir.set(pos.x - prev.x, pos.y - prev.y, pos.z - prev.z);
          const len = tmpDir.length();
          if (len > 1e-4) {
            tmpDir.divideScalar(len);
            const k = Math.min(1, scaledDelta * 8);
            dirRef.current.lerp(tmpDir, k).normalize();
          }
        }
        prevPosRef.current = pos;
      }

      const pulse = 1 + Math.sin(time * 2.4) * 0.04;

      if (layout.hasGlow && glowRef.current) {
        glowRef.current.scale.setScalar(enemySize * layout.glowScale * pulse);
      }

      if (layout.hasRegen) {
        // Ring unit radius is 0.9–1.5; the per-tier scale keeps the band
        // outside the body and wider each tier.
        if (ringRef.current) {
          const scale =
            REGEN_RING_SCALE_BASE +
            (layout.regenTier - 1) * REGEN_RING_SCALE_STEP;
          ringRef.current.scale.setScalar(enemySize * scale * pulse);
        }
        const particleCount = layout.regenParticleCount;
        for (let i = 0; i < particleCount; i++) {
          const particle = particleRefs.current[i];
          if (!particle) continue;
          const progress = (time * 0.6 + i * (1 / particleCount)) % 1;
          // Rise from the ring (feet plane, y = 0) up past the body top
          // (y = 1.55*size) so the energy stream is visible from the camera.
          particle.position.set(
            Math.sin(time * 2 + i * 2.1) * enemySize * 0.35,
            enemySize * (0.05 + progress * 1.6),
            Math.cos(time * 1.7 + i * 1.7) * enemySize * 0.35
          );
          particle.scale.setScalar(0.7 + progress * 1.3);
          (particle.material as MeshStandardMaterial).opacity =
            0.9 * Math.sin(progress * Math.PI);
        }
      }

      if (layout.hasShield || layout.hasSwift) {
        // Orient the direction group: local +x = travel direction, +y = world
        // up. The shield sits on the +x side (in front of the enemy) and the
        // swift straps trail on the -x side.
        const d = dirRef.current;
        tmpPerp.crossVectors(d, WORLD_UP);
        if (tmpPerp.lengthSq() < 1e-6) {
          tmpPerp.set(1, 0, 0);
        }
        tmpPerp.normalize();
        tmpMatrix.makeBasis(d, WORLD_UP, tmpPerp);
        tmpQuat.setFromRotationMatrix(tmpMatrix);
        if (dirGroupRef.current) {
          dirGroupRef.current.quaternion.copy(tmpQuat);
        }
        for (let i = 0; i < layout.swiftTier; i++) {
          const strap = strapRefs.current[i];
          if (!strap) continue;
          const offset = (i - (layout.swiftTier - 1) / 2) * enemySize * 0.6;
          // Flat ribbon just above the ground (the feet plane is y = 0),
          // trailing behind the body along the travel direction; u fades
          // toward the tail.
          strap.position.set(-1.0 * enemySize, 0.04 * enemySize, offset);
        }
      }
    });

    if (upgradeStacks.length === 0) return null;

    // Shield plates stand on the ground (the feet plane is y = 0, so the
    // center sits at half the plate height) in front of the body, on the +x
    // side of the direction group (which faces the travel direction).
    const shieldPlacements: {
      position: [number, number, number];
      scale: [number, number, number];
    }[] = [];
    if (layout.hasShield) {
      const tier = layout.shieldTier;
      if (tier === 1) {
        shieldPlacements.push({
          position: [enemySize * 1.15, 0.48 * enemySize, 0],
          scale: [enemySize * 0.7, enemySize * 0.95, enemySize * 0.5],
        });
      } else if (tier === 2) {
        shieldPlacements.push(
          {
            position: [enemySize * 1.1, 0.38 * enemySize, -0.45 * enemySize],
            scale: [enemySize * 0.55, enemySize * 0.75, enemySize * 0.5],
          },
          {
            position: [enemySize * 1.1, 0.38 * enemySize, 0.45 * enemySize],
            scale: [enemySize * 0.55, enemySize * 0.75, enemySize * 0.5],
          }
        );
      } else {
        shieldPlacements.push(
          {
            position: [enemySize * 1.15, 0.48 * enemySize, 0],
            scale: [enemySize * 0.7, enemySize * 0.95, enemySize * 0.5],
          },
          {
            position: [enemySize * 1.05, 0.35 * enemySize, -0.64 * enemySize],
            scale: [enemySize * 0.55, enemySize * 0.7, enemySize * 0.5],
          },
          {
            position: [enemySize * 1.05, 0.35 * enemySize, 0.64 * enemySize],
            scale: [enemySize * 0.55, enemySize * 0.7, enemySize * 0.5],
          }
        );
      }
    }

    return (
      <group>
        {(layout.hasShield || layout.hasSwift) && (
          <group ref={dirGroupRef}>
            {layout.hasShield &&
              shieldPlacements.map((placement, index) => (
                <mesh
                  key={`shield-${index}`}
                  position={placement.position}
                  // Plate normal (local +z) rotated to the travel direction so
                  // the shield face is perpendicular to the path.
                  rotation={[0, Math.PI / 2, 0]}
                  scale={placement.scale}
                  geometry={SHIELD_PLATE_GEOMETRY}
                  material={getEmissiveMaterial(layout.shieldColor, 0.95, 0.9)}
                />
              ))}
            {layout.hasSwift &&
              Array.from({ length: layout.swiftTier }, (_, index) => (
                <mesh
                  key={`strap-${index}`}
                  ref={(el) => {
                    if (el) strapRefs.current[index] = el;
                  }}
                  rotation={[Math.PI / 2, 0, 0]}
                  scale={[2.6 * enemySize, 0.55 * enemySize, 1]}
                  geometry={STRAP_PLANE_GEOMETRY}
                  material={STRAP_MATERIAL}
                />
              ))}
          </group>
        )}

        {layout.hasGlow && (
          <mesh
            ref={glowRef}
            position={[0, enemySize * 0.5, 0]}
            scale={enemySize * layout.glowScale}
            geometry={GLOW_SHELL_GEOMETRY}
            material={getEmissiveMaterial(
              layout.glowColor,
              layout.glowOpacity,
              1.2
            )}
          />
        )}

        {layout.hasRegen && (
          <>
            <mesh
              ref={ringRef}
              // The group origin is the enemy's feet (on the path surface); the
              // tiny +y keeps the flat ring just above the path to avoid
              // z-fighting. The frame loop drives the per-tier scale.
              position={[0, 0.03 * enemySize, 0]}
              scale={
                enemySize *
                (REGEN_RING_SCALE_BASE +
                  (layout.regenTier - 1) * REGEN_RING_SCALE_STEP)
              }
              geometry={REGEN_RING_GEOMETRY}
              material={getEmissiveMaterial(layout.regenColor, 0.5, 1.1)}
            />
            {Array.from({ length: layout.regenParticleCount }, (_, index) => (
              <EmissiveParticleSphere
                key={`regen-particle-${index}`}
                ref={(el) => {
                  if (el) particleRefs.current[index] = el;
                }}
                radius={0.06}
                color={layout.regenColor}
                emissiveIntensity={1.5}
                opacity={0.9}
              />
            ))}
          </>
        )}
      </group>
    );
  }
);

UpgradeEffect.displayName = "UpgradeEffect";
