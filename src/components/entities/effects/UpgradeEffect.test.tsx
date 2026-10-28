import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import type { Mesh } from "three";
import type { Entity } from "koota";

import { useGameStore } from "../../../core/stores/useGameStore";
import type {
  EnemyUpgradeConfig,
  EnemyUpgradeId,
} from "../../../core/types/game";
import { UpgradeEffect } from "./UpgradeEffect";

// IS_REACT_ACT_ENVIRONMENT is not typed on globalThis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const upgradeConfigs: Record<EnemyUpgradeId, EnemyUpgradeConfig> = {
  armored: {
    id: "armored",
    name: "a",
    description: "",
    displayRank: 1,
    rewardMultiplier: 1.15,
    indicatorColor: "#ff0000",
  },
  swift: {
    id: "swift",
    name: "s",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.35,
    indicatorColor: "#00ff00",
  },
  slowResistance: {
    id: "slowResistance",
    name: "u",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.25,
    indicatorColor: "#0000ff",
  },
  regenerating: {
    id: "regenerating",
    name: "r",
    description: "",
    displayRank: 2,
    rewardMultiplier: 1.3,
    indicatorColor: "#ffff00",
  },
};

// Minimal koota entity: the only trait UpgradeEffect reads per frame is
// Position (for the swift travel direction).
const makeEntity = (x = 0, y = 0, z = 0): Entity =>
  ({
    get: () => ({ x, y, z }),
  }) as unknown as Entity;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

/** The live three.js object behind a RTTR scene node. */
const objectOf = (node: ReturnType<Renderer["scene"]["find"]>): unknown =>
  (node as unknown as { instance?: unknown; _fiber?: { stateNode?: unknown } })
    .instance ??
  (node as unknown as { _fiber?: { stateNode?: unknown } })._fiber?.stateNode;

const getMeshes = (renderer: Renderer): Mesh[] =>
  renderer.scene
    .findAll((node) => node.type === "Mesh")
    .map((node) => objectOf(node) as Mesh);

// Count meshes by their three.js geometry `type` string. `instanceof` is
// unreliable here: RTTR's inline `<circleGeometry />` resolves a separate
// three module instance than the one the test imports.
const countGeometry = (renderer: Renderer, type: string): number =>
  getMeshes(renderer).filter((mesh) => mesh.geometry.type === type).length;

describe("UpgradeEffect", () => {
  it("renders one shield plate per tier (Armored)", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const tier1 = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "armored", tier: 1 }]}
        getTimeScale={() => 1}
      />
    );
    const tier3 = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "armored", tier: 3 }]}
        getTimeScale={() => 1}
      />
    );

    try {
      // ExtrudeGeometry is only used for the shield plates.
      expect(countGeometry(tier1, "ExtrudeGeometry")).toBe(1);
      expect(countGeometry(tier3, "ExtrudeGeometry")).toBe(3);
    } finally {
      tier1.unmount();
      tier3.unmount();
    }
  });

  it("renders a glow shell (Unstoppable) and nothing else", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const renderer = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "slowResistance", tier: 2 }]}
        getTimeScale={() => 1}
      />
    );

    try {
      // The glow shell is the only SphereGeometry in an Unstoppable stack.
      expect(countGeometry(renderer, "SphereGeometry")).toBe(1);
      expect(countGeometry(renderer, "ExtrudeGeometry")).toBe(0);
      expect(countGeometry(renderer, "PlaneGeometry")).toBe(0);
      expect(countGeometry(renderer, "RingGeometry")).toBe(0);
    } finally {
      renderer.unmount();
    }
  });

  it("renders a ground ring plus rising particles, scaled by tier (Regenerating)", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const tier1 = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "regenerating", tier: 1 }]}
        getTimeScale={() => 1}
      />
    );
    const tier3 = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "regenerating", tier: 3 }]}
        getTimeScale={() => 1}
      />
    );

    try {
      // 1 ground ring per stack; the particle stream grows with the tier
      // (3 + tier - 1) so tiers are distinguishable.
      expect(countGeometry(tier1, "RingGeometry")).toBe(1);
      expect(countGeometry(tier3, "RingGeometry")).toBe(1);
      expect(countGeometry(tier1, "SphereGeometry")).toBe(3);
      expect(countGeometry(tier3, "SphereGeometry")).toBe(5);
    } finally {
      tier1.unmount();
      tier3.unmount();
    }
  });

  it("renders one trailing strap per tier (Swift)", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const tier1 = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "swift", tier: 1 }]}
        getTimeScale={() => 1}
      />
    );
    const tier3 = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[{ id: "swift", tier: 3 }]}
        getTimeScale={() => 1}
      />
    );

    try {
      // PlaneGeometry is only used for the swift straps.
      expect(countGeometry(tier1, "PlaneGeometry")).toBe(1);
      expect(countGeometry(tier3, "PlaneGeometry")).toBe(3);
    } finally {
      tier1.unmount();
      tier3.unmount();
    }
  });

  it("renders nothing for an empty stack", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const renderer = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        entity={makeEntity()}
        enemySize={0.4}
        upgradeStacks={[]}
        getTimeScale={() => 1}
      />
    );

    try {
      expect(getMeshes(renderer)).toHaveLength(0);
    } finally {
      renderer.unmount();
    }
  });
});
