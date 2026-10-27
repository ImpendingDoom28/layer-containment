import { Billboard } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { FC, memo, useMemo, useRef } from "react";
import {
  DoubleSide,
  MeshStandardMaterial,
  type BufferGeometry,
  type Mesh,
} from "three";

import {
  enemyUpgradesSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import type {
  EnemyUpgradeId,
  EnemyUpgradeStack,
} from "../../../core/types/game";

import { EmissiveParticleSphere } from "./primitives/EmissiveParticleSphere";
import {
  UPGRADE_GLYPH_BOLT_GEOMETRY,
  UPGRADE_GLYPH_HEART_GEOMETRY,
  UPGRADE_GLYPH_SHIELD_GEOMETRY,
  UPGRADE_GLYPH_WIND_GEOMETRY,
} from "./primitives/UpgradeGlyphGeometries";
import type { EnemyAttachedEffectProps } from "./types";

type UpgradeEffectProps = EnemyAttachedEffectProps & {
  enemySize: number;
  upgradeStacks: EnemyUpgradeStack[];
};

type LayoutEntry = {
  id: EnemyUpgradeId;
  tier: number;
  color: string;
  geometry: BufferGeometry;
  material: MeshStandardMaterial;
  /** X offset of each glyph in this upgrade's row. */
  slots: number[];
};

type UpgradeLayout = {
  entries: LayoutEntry[];
  hasRegen: boolean;
  regenColor: string;
  spacing: number;
  glyphSize: number;
};

const GEOMETRY_BY_ID: Record<EnemyUpgradeId, BufferGeometry> = {
  armored: UPGRADE_GLYPH_SHIELD_GEOMETRY,
  regenerating: UPGRADE_GLYPH_HEART_GEOMETRY,
  slowResistance: UPGRADE_GLYPH_BOLT_GEOMETRY,
  swift: UPGRADE_GLYPH_WIND_GEOMETRY,
};

const FALLBACK_GLYPH_COLOR = "#ffffff";
const GLYPH_OPACITY = 0.85;
const REGEN_PARTICLE_COUNT = 2;

// One material per color: every enemy sharing an upgrade picks the same
// compiled program. Per-frame animation is done on the meshes (scale,
// position), never on the shared material, so the phase is per-enemy.
const glyphMaterialCache = new Map<string, MeshStandardMaterial>();

const getGlyphMaterial = (color: string): MeshStandardMaterial => {
  let material = glyphMaterialCache.get(color);
  if (!material) {
    material = new MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: GLYPH_OPACITY,
      depthWrite: false,
      side: DoubleSide,
    });
    glyphMaterialCache.set(color, material);
  }
  return material;
};

const buildUpgradeLayout = (
  upgradeStacks: EnemyUpgradeStack[],
  upgradeConfigs:
    Record<EnemyUpgradeId, { indicatorColor: string }> | null | undefined,
  enemySize: number
): UpgradeLayout => {
  const totalGlyphs = upgradeStacks.reduce((sum, stack) => sum + stack.tier, 0);
  const spacing = enemySize * 0.42;
  const glyphSize = enemySize * 0.36;

  let cursor = (1 - totalGlyphs) / 2;
  let hasRegen = false;
  let regenColor = FALLBACK_GLYPH_COLOR;
  const entries: LayoutEntry[] = upgradeStacks.map((stack) => {
    const slots: number[] = [];
    for (let i = 0; i < stack.tier; i++) {
      slots.push(cursor * spacing);
      cursor += 1;
    }
    const color =
      upgradeConfigs?.[stack.id]?.indicatorColor ?? FALLBACK_GLYPH_COLOR;
    if (stack.id === "regenerating") {
      hasRegen = true;
      regenColor = color;
    }
    return {
      id: stack.id,
      tier: stack.tier,
      color,
      geometry: GEOMETRY_BY_ID[stack.id],
      material: getGlyphMaterial(color),
      slots,
    };
  });

  return {
    entries,
    hasRegen,
    regenColor,
    spacing,
    glyphSize,
  };
};

/**
 * Camera-facing upgrade glyphs: one glyph per pick per upgrade (1 pick = 1
 * glyph, 3 picks = 3 glyphs), laid out in a row per upgrade around the
 * enemy. Glyph shape shows what the upgrade does — shield (Armored), bolt
 * (Unstoppable), heart + rising green energy (Regenerating), wind swoosh
 * (Swift, drifting sideways like a gust).
 */
export const UpgradeEffect: FC<UpgradeEffectProps> = memo(
  ({ enemySize, upgradeStacks, getTimeScale }) => {
    const enemyUpgrades = useGameStore(enemyUpgradesSelector);
    const timeRef = useRef(0);
    const glyphRefs = useRef<Partial<Record<EnemyUpgradeId, (Mesh | null)[]>>>(
      {}
    );
    const particleRefs = useRef<(Mesh | null)[]>(
      Array.from({ length: REGEN_PARTICLE_COUNT }, () => null)
    );

    const layout = useMemo(
      () => buildUpgradeLayout(upgradeStacks, enemyUpgrades, enemySize),
      [upgradeStacks, enemyUpgrades, enemySize]
    );

    useFrame((_, delta) => {
      timeRef.current += delta * getTimeScale();
      const time = timeRef.current;
      const pulse = 1 + Math.sin(time * 2) * 0.05;

      for (const entry of layout.entries) {
        const meshes = glyphRefs.current[entry.id];
        if (!meshes) continue;
        for (let i = 0; i < entry.tier; i++) {
          const mesh = meshes[i];
          if (!mesh) continue;
          mesh.scale.setScalar(layout.glyphSize * pulse);
          if (entry.id === "swift") {
            mesh.position.x =
              entry.slots[i] + Math.sin(time * 3) * layout.spacing * 0.2;
          }
        }
      }

      if (layout.hasRegen) {
        // Rising green energy: particles loop bottom -> top around the body.
        for (let i = 0; i < REGEN_PARTICLE_COUNT; i++) {
          const particle = particleRefs.current[i];
          if (!particle) continue;
          const progress = (time * 0.5 + i * 0.5) % 1;
          particle.position.set(
            Math.sin(time * 2 + i * 2.1) * layout.spacing * 0.3,
            enemySize * (-0.2 + progress * 1.45),
            0
          );
          particle.scale.setScalar(0.7 + progress * 1.1);
          (particle.material as MeshStandardMaterial).opacity =
            0.8 * Math.sin(progress * Math.PI);
        }
      }
    });

    if (layout.entries.length === 0) return null;

    return (
      <group position={[0, enemySize * 0.35, 0]}>
        <Billboard>
          {layout.entries.map((entry) =>
            entry.slots.map((x, index) => (
              <mesh
                key={`${entry.id}-${index}`}
                ref={(el) => {
                  const meshes = glyphRefs.current[entry.id] ?? [];
                  meshes[index] = el;
                  glyphRefs.current[entry.id] = meshes;
                }}
                position={[x, 0, 0]}
                geometry={entry.geometry}
                material={entry.material}
              />
            ))
          )}
        </Billboard>
        {layout.hasRegen && (
          <Billboard>
            {particleRefs.current.map((_, index) => (
              <EmissiveParticleSphere
                key={`regen-particle-${index}`}
                ref={(el) => {
                  particleRefs.current[index] = el;
                }}
                radius={0.05}
                color={layout.regenColor}
                emissiveIntensity={1.2}
                opacity={0.8}
              />
            ))}
          </Billboard>
        )}
      </group>
    );
  }
);

UpgradeEffect.displayName = "UpgradeEffect";
