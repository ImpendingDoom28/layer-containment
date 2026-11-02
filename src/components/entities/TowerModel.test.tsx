import { describe, expect, it } from "vitest";
import {
  Box3,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  Vector3,
} from "three";

import { prepareTowerModel } from "./TowerModel";

// A stand-in for one extracted Tower_*_ROOT: a root Group sitting at its baked
// collection offset (the GLB keeps the node at its original world position,
// e.g. x = 3, z = -3) with a single box child of known size. prepareTowerModel
// must rescale it to `size`, recenter it on the origin, and ground its base at
// y = 0 — without mutating the source (which is shared by every tower of a
// type through the useGLTF cache).
const buildSource = (): Object3D => {
  const root = new Group();
  root.name = "Tower_Slow_ROOT";
  root.position.set(3, 0, -3);
  const box = new BoxGeometry(1, 1.35, 1);
  const mesh = new Mesh(box, new MeshStandardMaterial());
  root.add(mesh);
  root.updateWorldMatrix(true, true);
  return root;
};

const worldBox = (obj: Object3D): Box3 => {
  const scene = new Scene();
  scene.add(obj);
  // setFromObject updates only the object's own matrix (not its children), so
  // update the whole subtree first, as the app does before measuring.
  obj.updateWorldMatrix(true, true);
  return new Box3().setFromObject(obj);
};

describe("prepareTowerModel", () => {
  it("rescales the largest span to the target size", () => {
    const group = prepareTowerModel(buildSource(), 0.9);
    const box = worldBox(group);
    const size = new Vector3();
    box.getSize(size);
    // 1.35 (max span) scaled to 0.9.
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(0.9, 5);
  });

  it("recenters the model horizontally on the origin", () => {
    const group = prepareTowerModel(buildSource(), 0.9);
    const box = worldBox(group);
    const center = new Vector3();
    box.getCenter(center);
    expect(center.x).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
  });

  it("grounds the base at y = 0", () => {
    const group = prepareTowerModel(buildSource(), 0.9);
    const box = worldBox(group);
    expect(box.min.y).toBeCloseTo(0, 5);
  });

  it("does not mutate the shared source node", () => {
    const source = buildSource();
    const before = source.position.clone();
    const childCount = source.children.length;
    prepareTowerModel(source, 0.9);
    expect(source.position.equals(before)).toBe(true);
    expect(source.children.length).toBe(childCount);
  });
});
