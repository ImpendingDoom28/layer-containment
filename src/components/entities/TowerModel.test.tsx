import { describe, expect, it, vi } from "vitest";
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

import { buildGhostMaterials, prepareTowerModel } from "./TowerModel";

// The ghost's "invalid" tint reads the destructive CSS colour; in the node test
// environment (no DOM) pin it to a known red so the tint can be asserted.
vi.mock("../ui/lib/cssUtils", () => ({
  getCssColorValue: vi.fn().mockReturnValue("#ff0000"),
}));

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

  it("marks every mesh to cast and receive shadows", () => {
    const group = prepareTowerModel(buildSource(), 0.9);
    let meshCount = 0;
    group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (!mesh.isMesh) return;
      meshCount += 1;
      expect(mesh.castShadow).toBe(true);
      expect(mesh.receiveShadow).toBe(true);
    });
    expect(meshCount).toBeGreaterThan(0);
  });
});

describe("buildGhostMaterials", () => {
  it("returns one translucent clone per mesh, in traverse order", () => {
    const source = buildSource(); // two meshes (base + overhang)
    const ghost = buildGhostMaterials(source, false);
    expect(ghost.length).toBe(2);
    for (const entry of ghost) {
      const mat = Array.isArray(entry) ? entry[0] : entry;
      expect(mat).toBeInstanceOf(MeshStandardMaterial);
      expect(mat.transparent).toBe(true);
      expect(mat.opacity).toBeCloseTo(0.5, 5);
    }
  });

  it("does not mutate the shared source's materials", () => {
    const source = buildSource();
    const before: MeshStandardMaterial[] = [];
    source.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material)) {
        before.push(mesh.material as MeshStandardMaterial);
      }
    });
    buildGhostMaterials(source, false);
    // The original materials must be untouched (the ghost uses clones).
    for (const mat of before) {
      expect(mat.transparent).toBe(false);
      expect(mat.opacity).toBe(1);
    }
  });

  it("preserves the model's per-part colour for a valid preview", () => {
    const source = new Group();
    const red = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: "#ff0000" }));
    source.add(red);
    source.updateWorldMatrix(true, true);
    const ghost = buildGhostMaterials(source, false);
    const mat = (Array.isArray(ghost[0]) ? ghost[0][0] : ghost[0]) as MeshStandardMaterial;
    expect(mat.color.getHex()).toBe(0xff0000);
  });

  it("tints every mesh the destructive colour when invalid", () => {
    const source = buildSource();
    const ghost = buildGhostMaterials(source, true);
    for (const entry of ghost) {
      const mat = (Array.isArray(entry) ? entry[0] : entry) as MeshStandardMaterial;
      expect(mat.color.getHex()).toBe(0xff0000);
    }
  });

  it("clones each material in a multi-material mesh individually", () => {
    const source = new Group();
    const matA = new MeshStandardMaterial({ color: "#ff0000" });
    const matB = new MeshStandardMaterial({ color: "#00ff00" });
    const multi = new Mesh(new BoxGeometry(1, 1, 1), [matA, matB]);
    source.add(multi);
    source.updateWorldMatrix(true, true);
    const ghost = buildGhostMaterials(source, false);
    expect(ghost.length).toBe(1);
    const pair = ghost[0] as MeshStandardMaterial[];
    expect(pair.length).toBe(2);
    expect(pair[0].color.getHex()).toBe(0xff0000);
    expect(pair[1].color.getHex()).toBe(0x00ff00);
    for (const m of pair) {
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBeCloseTo(0.5, 5);
    }
  });
});
