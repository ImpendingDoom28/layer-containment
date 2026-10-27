import ReactThreeTestRenderer from "@react-three/test-renderer";
import { describe, expect, it } from "vitest";
import { BoxGeometry, type Mesh } from "three";

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

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

/** The live three.js object behind a RTTR scene node. */
const objectOf = (node: ReturnType<Renderer["scene"]["find"]>): unknown =>
  (node as unknown as { instance?: unknown; _fiber?: { stateNode?: unknown } })
    .instance ??
  (node as unknown as { _fiber?: { stateNode?: unknown } })._fiber?.stateNode;

// All non-box meshes: glyph shapes (ShapeGeometry) plus the regen energy
// particles (SphereGeometry).
const getIndicatorMeshes = (renderer: Renderer): Mesh[] =>
  renderer.scene
    .findAll((node) => node.type === "Mesh")
    .map((node) => objectOf(node) as Mesh)
    .filter((mesh) => !(mesh.geometry instanceof BoxGeometry));

describe("UpgradeEffect", () => {
  it("renders one glyph per pick (tier = glyph count)", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const renderer = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        enemySize={0.4}
        upgradeStacks={[
          { id: "armored", tier: 3 },
          { id: "swift", tier: 1 },
        ]}
        getTimeScale={() => 1}
      />
    );

    try {
      expect(getIndicatorMeshes(renderer)).toHaveLength(4);
    } finally {
      renderer.unmount();
    }
  });

  it("renders nothing for an empty stack", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const renderer = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        enemySize={0.4}
        upgradeStacks={[]}
        getTimeScale={() => 1}
      />
    );

    try {
      expect(getIndicatorMeshes(renderer)).toHaveLength(0);
    } finally {
      renderer.unmount();
    }
  });

  it("adds rising-energy particles only for regenerating enemies", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const withRegen = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        enemySize={0.4}
        upgradeStacks={[{ id: "regenerating", tier: 1 }]}
        getTimeScale={() => 1}
      />
    );
    const withoutRegen = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        enemySize={0.4}
        upgradeStacks={[{ id: "armored", tier: 1 }]}
        getTimeScale={() => 1}
      />
    );

    try {
      // 1 heart + 2 energy particles vs 1 shield only
      expect(getIndicatorMeshes(withRegen)).toHaveLength(3);
      expect(getIndicatorMeshes(withoutRegen)).toHaveLength(1);
    } finally {
      withRegen.unmount();
      withoutRegen.unmount();
    }
  });

  it("scales glyphs with the enemy size", async () => {
    useGameStore.setState({ enemyUpgrades: upgradeConfigs });
    const renderer = await ReactThreeTestRenderer.create(
      <UpgradeEffect
        enemySize={0.8}
        upgradeStacks={[{ id: "armored", tier: 1 }]}
        getTimeScale={() => 1}
      />
    );

    try {
      await ReactThreeTestRenderer.act(async () => {
        await renderer.advanceFrames(1, 1);
      });
      const [glyph] = getIndicatorMeshes(renderer);
      // Base glyph size is 0.36 * enemySize (pulse keeps it within +/-5%)
      expect(glyph.scale.x).toBeGreaterThan(0.8 * 0.36 * 0.9);
      expect(glyph.scale.x).toBeLessThan(0.8 * 0.36 * 1.1);
    } finally {
      renderer.unmount();
    }
  });
});
