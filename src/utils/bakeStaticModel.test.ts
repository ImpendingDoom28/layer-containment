import { describe, expect, it, vi } from "vitest";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Scene,
  type Object3D,
} from "three";

import { bakeStaticModel } from "./bakeStaticModel";

// The leg-prefix exclusion the walk rig relies on: a mesh is skipped when it or
// any ancestor is a leg pivot (Leg_L / Leg_R / Leg_L001 / ...).
const isUnderLeg = (object: Object3D): boolean => {
  let node: Object3D | null = object;
  while (node !== null) {
    if (node.name.startsWith("Leg_L") || node.name.startsWith("Leg_R")) return true;
    node = node.parent;
  }
  return false;
};

const meshCount = (root: Object3D): number => {
  let count = 0;
  root.traverse((object) => {
    if ((object as Partial<Mesh>).isMesh) count += 1;
  });
  return count;
};

// Adds the subtree to a throwaway scene and returns the world-space bbox of the
// given object, mirroring how the renderer measures it.
const worldBox = (subtree: Object3D, object: Object3D): Box3 => {
  const scene = new Scene();
  scene.add(subtree);
  subtree.updateWorldMatrix(true, true);
  return new Box3().setFromObject(object);
};

// A stand-in for an enemy ROOT: a root Group at its baked collection offset
// (x = 2, z = 3, like the real GLBs) holding a chassis with two same-material
// parts, a unique single-material part, and a leg pivot with two same-material
// meshes that the exclusion must protect.
const buildSource = () => {
  const root = new Group();
  root.name = "Enemy_ROOT";
  root.position.set(2, 0, 3);

  const chassis = new Group();
  chassis.name = "Chassis_Geometry";
  chassis.position.set(0, 1, 0);
  const matA = new MeshStandardMaterial();
  matA.name = "armor";
  const a = new Mesh(new BoxGeometry(1, 1, 1), matA);
  a.name = "part_a";
  const b = new Mesh(new BoxGeometry(1, 1, 1), matA);
  b.name = "part_b";
  b.position.set(2, 0, 0);
  const unique = new Mesh(new BoxGeometry(0.5, 0.5, 0.5), new MeshStandardMaterial({ name: "solo" }));
  unique.name = "solo_part";
  unique.position.set(0, 0.5, 0.5);
  chassis.add(a, b, unique);
  root.add(chassis);

  const leg = new Group();
  leg.name = "Leg_L";
  leg.position.set(-1, 0.5, 0);
  const matLeg = new MeshStandardMaterial();
  matLeg.name = "leg";
  const legTop = new Mesh(new BoxGeometry(0.5, 1, 0.5), matLeg);
  legTop.name = "Leg_L_Geometry";
  const legBottom = new Mesh(new BoxGeometry(0.5, 1, 0.5), matLeg);
  legBottom.name = "Leg_L_Geometry_1";
  legBottom.position.set(0, 1, 0);
  leg.add(legTop, legBottom);
  root.add(leg);

  root.updateWorldMatrix(true, true);
  return { root, matA, matLeg, a, b, unique, legTop, legBottom };
};

describe("bakeStaticModel", () => {
  it("merges same-material static meshes into one and bakes them into root space", () => {
    const { root, a, b } = buildSource();
    const result = bakeStaticModel(root, isUnderLeg);

    // The two armor meshes collapse into one; the leg (excluded) keeps both, and
    // the solo mesh stays. 6 -> 4 meshes.
    expect(meshCount(result)).toBe(4);

    const merged = result.children.find((child) => child.name === "Baked_armor") as Mesh;
    expect(merged).toBeDefined();
    expect(merged.geometry.attributes["position"].count).toBe(
      a.geometry.attributes["position"].count + b.geometry.attributes["position"].count
    );

    // The merged mesh (a root child with identity transform) must span exactly
    // the union of the two original armor meshes' world positions — this proves
    // the per-mesh transform was baked in, not dropped.
    const mergedBox = worldBox(result, merged);
    const boxA = worldBox(root, a);
    const boxB = worldBox(root, b);
    const expectedMinX = Math.min(boxA.min.x, boxB.min.x);
    const expectedMaxX = Math.max(boxA.max.x, boxB.max.x);
    const expectedMinY = Math.min(boxA.min.y, boxB.min.y);
    const expectedMaxY = Math.max(boxA.max.y, boxB.max.y);
    const expectedMinZ = Math.min(boxA.min.z, boxB.min.z);
    const expectedMaxZ = Math.max(boxA.max.z, boxB.max.z);
    expect(mergedBox.min.x).toBeCloseTo(expectedMinX, 5);
    expect(mergedBox.max.x).toBeCloseTo(expectedMaxX, 5);
    expect(mergedBox.min.y).toBeCloseTo(expectedMinY, 5);
    expect(mergedBox.max.y).toBeCloseTo(expectedMaxY, 5);
    expect(mergedBox.min.z).toBeCloseTo(expectedMinZ, 5);
    expect(mergedBox.max.z).toBeCloseTo(expectedMaxZ, 5);
  });

  it("keeps the excluded leg meshes intact under their named pivot", () => {
    const { root } = buildSource();
    const result = bakeStaticModel(root, isUnderLeg);

    const leg = result.getObjectByName("Leg_L");
    expect(leg).toBeDefined();
    // Both leg meshes survive, unmerged and unrenamed.
    expect(result.getObjectByName("Leg_L_Geometry")).toBeDefined();
    expect(result.getObjectByName("Leg_L_Geometry_1")).toBeDefined();
    // No Baked_ mesh was created for the leg material.
    expect(result.children.find((child) => child.name === "Baked_leg")).toBeUndefined();
  });

  it("keeps the named pivot nodes findable by name", () => {
    const { root } = buildSource();
    const result = bakeStaticModel(root, isUnderLeg);
    expect(result.name).toBe("Enemy_ROOT");
    expect(result.getObjectByName("Chassis_Geometry")).toBeDefined();
    expect(result.getObjectByName("Leg_L")).toBeDefined();
    // The solo (single-material) mesh is left in place, unrenamed.
    expect(result.getObjectByName("solo_part")).toBeDefined();
  });

  it("does not dispose the shared source geometries or materials", () => {
    const { root, a, b, legTop, legBottom, matA, matLeg } = buildSource();
    const aDispose = vi.spyOn(a.geometry, "dispose");
    const bDispose = vi.spyOn(b.geometry, "dispose");
    const legDispose = vi.spyOn(legTop.geometry, "dispose");
    const legDispose2 = vi.spyOn(legBottom.geometry, "dispose");
    const matADispose = vi.spyOn(matA, "dispose");
    const matLegDispose = vi.spyOn(matLeg, "dispose");

    bakeStaticModel(root, isUnderLeg);

    expect(aDispose).not.toHaveBeenCalled();
    expect(bDispose).not.toHaveBeenCalled();
    expect(legDispose).not.toHaveBeenCalled();
    expect(legDispose2).not.toHaveBeenCalled();
    expect(matADispose).not.toHaveBeenCalled();
    expect(matLegDispose).not.toHaveBeenCalled();
  });

  it("does not mutate the shared source node", () => {
    const { root, a } = buildSource();
    const before = root.position.clone();
    const childCount = root.children.length;
    const meshCountBefore = meshCount(root);
    bakeStaticModel(root, isUnderLeg);
    expect(root.position.equals(before)).toBe(true);
    expect(root.children.length).toBe(childCount);
    expect(meshCount(root)).toBe(meshCountBefore);
    // The original mesh is still parented exactly where it was.
    expect(a.parent?.name).toBe("Chassis_Geometry");
  });

  it("shares the merged geometry across repeat calls of the same source", () => {
    const { root } = buildSource();
    const first = bakeStaticModel(root, isUnderLeg);
    const second = bakeStaticModel(root, isUnderLeg);
    // Two distinct instance trees (each a fresh clone)...
    expect(first).not.toBe(second);
    // ...but the baked armor geometry is shared (no re-merge).
    const firstMerged = first.children.find((child) => child.name === "Baked_armor") as Mesh;
    const secondMerged = second.children.find((child) => child.name === "Baked_armor") as Mesh;
    expect(firstMerged.geometry).toBe(secondMerged.geometry);
  });

  it("leaves single-material groups untouched (no forced merge)", () => {
    const { root, unique } = buildSource();
    const result = bakeStaticModel(root, isUnderLeg);
    // The solo mesh is not merged, renamed, or reparented: it keeps its name,
    // its (shared, unmerged) original geometry, and its parent.
    const solo = result.getObjectByName("solo_part");
    expect(solo).toBeDefined();
    expect((solo as Mesh).geometry).toBe(unique.geometry);
    expect(solo?.parent?.name).toBe("Chassis_Geometry");
  });

  it("is idempotent: re-baking a baked model does not merge further", () => {
    const { root } = buildSource();
    const once = bakeStaticModel(root, isUnderLeg);
    const onceCount = meshCount(once);
    const twice = bakeStaticModel(once, isUnderLeg);
    expect(meshCount(twice)).toBe(onceCount);
  });

  it("zero-fills a missing attribute so a same-material group still merges", () => {
    const root = new Group();
    root.name = "Root";
    const mat = new MeshStandardMaterial();
    mat.name = "armor";
    // Two boxes with uv, one box without uv (the player_base "black armor" case):
    // a raw merge would bail, but zero-filling the uv keeps them mergeable.
    const withUv1 = new BoxGeometry(1, 1, 1);
    const withUv2 = new BoxGeometry(1, 1, 1);
    const noUv = new BoxGeometry(1, 1, 1);
    noUv.deleteAttribute("uv");
    const m1 = new Mesh(withUv1, mat);
    const m2 = new Mesh(withUv2, mat);
    m2.position.set(1, 0, 0);
    const m3 = new Mesh(noUv, mat);
    m3.position.set(2, 0, 0);
    root.add(m1, m2, m3);
    root.updateWorldMatrix(true, true);

    const result = bakeStaticModel(root, () => false);
    expect(meshCount(result)).toBe(1);
    const merged = result.children.find((child) => child.name === "Baked_armor") as Mesh;
    expect(merged.geometry.attributes["uv"]).toBeDefined();
    expect(merged.geometry.attributes["position"].count).toBe(
      withUv1.attributes["position"].count +
        withUv2.attributes["position"].count +
        noUv.attributes["position"].count
    );
  });

  it("converts non-indexed members before merging", () => {
    const root = new Group();
    root.name = "Root";
    const mat = new MeshStandardMaterial();
    mat.name = "armor";
    const indexed = new BoxGeometry(1, 1, 1);
    const nonIndexed = new BoxGeometry(1, 1, 1).toNonIndexed();
    const m1 = new Mesh(indexed, mat);
    const m2 = new Mesh(nonIndexed, mat);
    m2.position.set(1, 0, 0);
    root.add(m1, m2);
    root.updateWorldMatrix(true, true);

    const result = bakeStaticModel(root, () => false);
    expect(meshCount(result)).toBe(1);
    const merged = result.children.find((child) => child.name === "Baked_armor") as Mesh;
    // Merged geometry is non-indexed: the indexed member is expanded
    // (24 -> 36 verts) so both members end up non-indexed and merge.
    expect(merged.geometry.index).toBeNull();
    expect(merged.geometry.attributes["position"].count).toBe(
      indexed.toNonIndexed().attributes["position"].count +
        nonIndexed.attributes["position"].count
    );
  });
});
