import { useCallback, memo, type FC, type ReactNode } from "react";
import {
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Material,
  type Object3D,
} from "three";

import type { TowerModelSpec, TowerType } from "../../core/types/game";
import { getCssColorValue } from "../ui/lib/cssUtils";
import { ModelLoader } from "./ModelLoader";

// Shared, cached scratch state for the one-time recenter math (towers are
// placed a handful at a time; the vectors and accumulator are reused and are
// not per-frame).
const _center = new Vector3();
const _size = new Vector3();
const _box = new Box3();
const _groundBox = new Box3();

// A model part "touches the ground" when its bottom is within this tolerance
// of the lowest point of the whole model.
const GROUND_EPSILON = 0.02;

/**
 * Computes the world-space bounding box of every part of `source` that touches
 * the ground. In these models that is exactly the chassis/base (the tower
 * body everything sits on), because the turret parts — barrels, pulse rings,
 * field arrays — are elevated or float above it.
 */
const groundFootprint = (source: Object3D): Box3 => {
  _box.setFromObject(source);
  _groundBox.makeEmpty();
  const min = _box.min.y;
  source.traverse((obj) => {
    if (obj.children.length > 0) return;
    const partBox = new Box3().setFromObject(obj);
    if (partBox.min.y <= min + GROUND_EPSILON) {
      _groundBox.union(partBox);
    }
  });
  return _groundBox;
};

/**
 * Rescales a tower model so its **base** footprint fits within `size`,
 * recenters the base on the origin, and grounds its bottom at `y = 0`.
 *
 * The scale and the horizontal centering are both taken from the base
 * (chassis) rather than from the model's full bounding box: the turrets stick
 * out beyond the base (long barrels on the basic and laser towers, a tall
 * sphere on the slow tower), so a full-box fit would shrink those towers and
 * pull their bases off the tile center. The turret overhang is intentional
 * design and is preserved as-is.
 *
 * The model is loaded at its baked rest orientation: the turret ("Azimuth")
 * faces the model's local +Z and the runtime yaw (see `TowerSystem`) rotates
 * the turret node toward the target. The source node is cloned, so the cached
 * GLTF (shared by every tower of a type) is never mutated; the clone only
 * *references* the shared geometry/material, so it needs no dispose on unmount.
 */
export const prepareTowerModel = (source: Object3D, size: number): Group => {
  source.updateWorldMatrix(true, true);
  const fullBox = new Box3().setFromObject(source);
  const baseBox = groundFootprint(source);
  const box = baseBox.isEmpty() ? fullBox : baseBox;
  box.getCenter(_center);
  box.getSize(_size);
  const span = Math.max(_size.x, _size.z);
  const scale = span > 0 ? size / span : 1;

  const group = new Group();
  group.scale.setScalar(scale);
  // Center the base's horizontal midpoint on the origin and ground the model's
  // lowest point at y = 0. The model root sits at its baked collection
  // position (e.g. x = -3, z = -3), so the base center is negated and scaled
  // to pull the geometry back to the tile centre.
  group.position.set(
    -_center.x * scale,
    -fullBox.min.y * scale,
    -_center.z * scale,
  );
  const clone = source.clone();
  // The tower body is physical, so let it cast and receive shadows like the
  // enemy models and the primitive fallback (the shadow flags are not part of
  // the GLTF and would otherwise be left at three's defaults).
  clone.traverse((child) => {
    if ((child as Partial<Mesh>).isMesh) {
      (child as Mesh).castShadow = true;
      (child as Mesh).receiveShadow = true;
    }
  });
  group.add(clone);
  return group;
};

// "solid" is the placed tower (the model's own baked materials). "preview" is
// the translucent placement ghost; "invalid" is the same ghost tinted the
// destructive colour so an illegal drop reads at a glance.
export type TowerModelVariant = "solid" | "preview" | "invalid";

// Ghost opacity, matching the old primitive preview's previewOpacity.
const PREVIEW_OPACITY = 0.5;

type GhostMaterials = (Material | Material[])[];

const makeGhostMaterial = (original: Material, invalid: boolean): Material => {
  const mat = original.clone();
  mat.transparent = true;
  mat.opacity = PREVIEW_OPACITY;
  // Only color-bearing materials (e.g. MeshStandardMaterial from the GLTF)
  // can be tinted; base Material has no `color`.
  if (invalid && mat instanceof MeshStandardMaterial) {
    mat.color.copy(new Color(getCssColorValue("destructive")));
  }
  return mat;
};

/**
 * Builds a translucent ghost material for every mesh of `source` (a clone, so
 * the shared GLTF's materials are never mutated), in the same traverse order
 * the prepared group's meshes appear in — so the clones can be re-attached by
 * index. `invalid` tints the ghost the destructive colour. Pure: no caching,
 * no DOM access beyond the single `getCssColorValue` lookup for the red tint.
 */
export const buildGhostMaterials = (
  source: Object3D,
  invalid: boolean,
): GhostMaterials => {
  const result: GhostMaterials = [];
  source.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      result.push(mesh.material.map((m) => makeGhostMaterial(m, invalid)));
    } else if (mesh.material) {
      result.push(makeGhostMaterial(mesh.material, invalid));
    }
  });
  return result;
};

// One ghost-material set per (type, variant), built once from the shared GLTF
// node. The ghost geometry is shared with the placed tower, so only the
// material is per-variant; caching means the cursor crossing tiles (which
// toggles preview/invalid constantly while placing) reuses the existing clones
// instead of leaking a fresh set per hover. R3F never disposes a <primitive>'s
// children, so these stay cached for the session and are reused, not freed.
const previewMaterialsCache = new Map<string, GhostMaterials>();

const getPreviewMaterials = (
  source: Object3D,
  type: TowerType,
  variant: TowerModelVariant,
): GhostMaterials => {
  const key = `${type}|${variant}`;
  const cached = previewMaterialsCache.get(key);
  if (cached) return cached;
  const materials = buildGhostMaterials(source, variant === "invalid");
  previewMaterialsCache.set(key, materials);
  return materials;
};

type TowerModelProps = {
  type: TowerType;
  /** The 3D model this tower type renders, from the game config. */
  model: TowerModelSpec;
  size: number;
  /**
   * Which look to render: the placed tower's own materials ("solid"), or the
   * translucent placement ghost ("preview" / "invalid", the latter tinted the
   * destructive colour).
   */
  variant?: TowerModelVariant;
  fallback: ReactNode;
  /**
   * Called with the prepared model group once it is ready (and with `null`
   * on unmount), so the parent can look up the rotating turret node by name.
   * Pass a stable reference.
   */
  onModelReady?: (object: Object3D | null) => void;
};

/**
 * Renders the 3D model of a tower type as the body. Loading, node extraction,
 * and Suspense isolation are all delegated to the generic `ModelLoader`; this
 * component supplies the shared `prepare` transform (fit the base to the tile
 * footprint, recenter the base, and ground it) and, for the placement preview,
 * re-points the ghost clone's materials at a translucent (optionally red)
 * variant so the real model reads as the draggable ghost. `size` is the target
 * base footprint; `model` is the model to render (from the game config), and
 * `type` keys the per-(type, variant) ghost-material cache.
 */
export const TowerModel: FC<TowerModelProps> = memo(
  ({ type, model, size, variant = "solid", fallback, onModelReady }) => {
    const prepare = useCallback(
      (source: Object3D) => {
        const group = prepareTowerModel(source, size);
        if (variant !== "solid") {
          const materials = getPreviewMaterials(source, type, variant);
          // Re-attach by index in the same traverse order buildGhostMaterials
          // used, skipping non-meshes and mesh-less parts exactly the way it did
          // so the indices stay aligned.
          let index = 0;
          group.traverse((obj) => {
            const mesh = obj as Mesh;
            if (!mesh.isMesh) return;
            if (Array.isArray(mesh.material) || mesh.material) {
              mesh.material = materials[index];
              index += 1;
            }
          });
        }
        return group;
      },
      [size, variant, type],
    );
    return (
      <ModelLoader
        url={model.url}
        node={model.node}
        prepare={prepare}
        fallback={fallback}
        onObjectReady={onModelReady}
      />
    );
  }
);

TowerModel.displayName = "TowerModel";
