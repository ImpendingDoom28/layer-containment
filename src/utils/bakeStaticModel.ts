import {
  BufferAttribute,
  Matrix4,
  Mesh,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Merging is the expensive part, so the result is cached per source node.
// useGLTF hands the same cached node to every instance of a model, so each
// instance receives a cheap clone that shares the merged geometry instead of
// re-merging. Keyed by the source node (WeakMap) so the entry is released
// automatically when the parsed GLTF is collected.
const bakedCache = new WeakMap<Object3D, Object3D>();

// Merges a group of same-material geometries into one. All members must
// otherwise share an attribute set: if any is non-indexed, convert them all,
// and zero-fill any attribute a member lacks (a missing attribute samples as
// (0, 0) in the shader anyway, so this is visually inert and only needed so
// mergeGeometries does not bail out).
const mergeGroup = (geometries: BufferGeometry[]): BufferGeometry | null => {
  if (geometries.some((geometry) => geometry.index === null)) {
    for (let i = 0; i < geometries.length; i++) {
      if (geometries[i].index !== null) {
        geometries[i] = geometries[i].toNonIndexed();
      }
    }
  }

  const attributeNames = new Set<string>();
  const itemSizes = new Map<string, number>();
  for (const geometry of geometries) {
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      attributeNames.add(name);
      if (!itemSizes.has(name)) itemSizes.set(name, attribute.itemSize);
    }
  }
  for (const geometry of geometries) {
    const position = geometry.attributes["position"];
    const vertexCount = position ? position.count : 0;
    for (const name of attributeNames) {
      if (geometry.attributes[name] === undefined) {
        const itemSize = itemSizes.get(name) ?? 1;
        geometry.setAttribute(
          name,
          new BufferAttribute(new Float32Array(vertexCount * itemSize), itemSize)
        );
      }
    }
  }

  return mergeGeometries(geometries);
};

/**
 * Bakes a model's static meshes so that every mesh sharing a material collapses
 * into a single merged mesh, cutting the per-instance draw calls. The original
 * named nodes are kept (the walk rig and other lookups still resolve by name);
 * only the leaf meshes within a same-material group are replaced. A merged mesh
 * is a direct child of the root with an identity transform, its vertices baked
 * into the root's local space. Original geometries and materials are shared and
 * never disposed — only the throwaway per-member clones used to build the merge
 * are. Repeated calls for the same source node are a cheap clone of the cached
 * result. `exclude` reports a mesh to leave entirely untouched (e.g. the leg
 * pivots the walk rig animates).
 */
export const bakeStaticModel = (
  source: Object3D,
  exclude: (object: Object3D) => boolean
): Object3D => {
  const cached = bakedCache.get(source);
  if (cached !== undefined) return cached.clone(true);

  const baked = source.clone(true);
  baked.updateWorldMatrix(true, true);
  const rootInv = new Matrix4().copy(baked.matrixWorld).invert();

  // Group mergeable meshes by material identity and record, for each, the
  // transform that bakes it into the root's local space. All world matrices are
  // read before any mutation, so removing/reparenting meshes later is safe.
  const groups = new Map<Material, Mesh[]>();
  const rootSpace = new Map<Mesh, Matrix4>();
  baked.traverse((object) => {
    if (!((object as Partial<Mesh>).isMesh)) return;
    const mesh = object as Mesh;
    if (exclude(object)) return;
    if (Array.isArray(mesh.material)) return;
    const geometry = mesh.geometry;
    if (!geometry || !geometry.attributes["position"]) return;
    const material = mesh.material as Material;
    const list = groups.get(material);
    if (list) list.push(mesh);
    else groups.set(material, [mesh]);
    rootSpace.set(
      mesh,
      new Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld)
    );
  });

  for (const [material, meshes] of groups) {
    if (meshes.length < 2) continue;

    const tempGeometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(rootSpace.get(mesh)!);
      return geometry;
    });

    const merged = mergeGroup(tempGeometries);
    if (merged === null) {
      // Incompatible members: keep the originals untouched.
      tempGeometries.forEach((geometry) => geometry.dispose());
      continue;
    }
    tempGeometries.forEach((geometry) => geometry.dispose());

    const mergedMesh = new Mesh(merged, material);
    mergedMesh.name = `Baked_${material.name || "material"}`;
    mergedMesh.castShadow = meshes.some((mesh) => mesh.castShadow);
    mergedMesh.receiveShadow = meshes.some((mesh) => mesh.receiveShadow);

    meshes.forEach((mesh) => mesh.removeFromParent());
    baked.add(mergedMesh);
  }

  bakedCache.set(source, baked);
  return baked.clone(true);
};
