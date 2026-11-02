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

const material = () => new MeshStandardMaterial();

// A stand-in for one extracted Tower_*_ROOT: a root Group sitting at its baked
// collection offset (the GLB keeps the node at its original world position,
// e.g. x = 3, z = -3) with a ground-level base plus an elevated part that
// overhangs it (a barrel or turret). The full model box and the base box
// disagree — exactly the case the prepare must get right.
const buildSource = (): Object3D => {
  const root = new Group();
  root.name = "Tower_Slow_ROOT";
  root.position.set(3, 0, -3);

  const base = new Mesh(new BoxGeometry(1, 0.3, 1), material());
  base.position.y = 0.15; // bottom at y = 0, touches the ground
  root.add(base);

  const overhang = new Mesh(new BoxGeometry(0.5, 0.5, 1.5), material());
  overhang.position.set(0, 0.55, 0.5); // elevated, sticks out beyond the base
  root.add(overhang);

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
  it("fits the base footprint (not the full model) to the target size", () => {
    const group = prepareTowerModel(buildSource(), 0.9);
    const fullSize = new Vector3();
    worldBox(group).getSize(fullSize);
    // The base (span 1.0) is scaled to 0.9; the full box is larger because the
    // overhang extends beyond the base — proving the base, not the full box,
    // drove the scale.
    expect(Math.min(fullSize.x, fullSize.z)).toBeCloseTo(0.9, 5);
    expect(Math.max(fullSize.x, fullSize.z)).toBeGreaterThan(0.9);
  });

  it("centers the base on the origin (ignoring the overhang)", () => {
    const group = prepareTowerModel(buildSource(), 0.9);
    const fullCenter = new Vector3();
    worldBox(group).getCenter(fullCenter);
    // The full model center is pulled toward the overhang (+z), while the base
    // must sit exactly on the tile center.
    expect(fullCenter.z).toBeGreaterThan(0.05);

    const baseCenter = new Vector3();
    let baseSpan = 0;
    group.traverse((obj) => {
      if (obj.children.length > 0) return;
      const partBox = new Box3().setFromObject(obj);
      if (partBox.min.y <= 0.02) {
        partBox.getCenter(baseCenter);
        const partSize = new Vector3();
        partBox.getSize(partSize);
        baseSpan = Math.max(partSize.x, partSize.z);
      }
    });
    expect(baseCenter.x).toBeCloseTo(0, 5);
    expect(baseCenter.z).toBeCloseTo(0, 5);
    expect(baseSpan).toBeCloseTo(0.9, 5);
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

  it("uses the model's lowest part as the base when nothing else touches the ground", () => {
    const root = new Group();
    root.name = "Floating";
    const part = new Mesh(new BoxGeometry(1, 1, 1), material());
    part.position.y = 1; // the only part, so it is the "ground" part
    root.add(part);
    root.updateWorldMatrix(true, true);
    const group = prepareTowerModel(root, 0.9);
    const box = worldBox(group);
    const size = new Vector3();
    box.getSize(size);
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(0.9, 5);
    expect(box.min.y).toBeCloseTo(0, 5);
  });
});
