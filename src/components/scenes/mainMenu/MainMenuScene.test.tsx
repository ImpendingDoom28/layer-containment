import { readFileSync } from "node:fs";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { WorldProvider } from "koota/react";

import { EntityIdProvider } from "../../../core/contexts/EntityIdContext";
import { enemyActions } from "../../../core/ecs/actions/enemyActions";
import { getEnemySnapshots } from "../../../core/ecs/selectors/enemySnapshots";
import { testWorld } from "../../../core/ecs/world";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import { useGameStore } from "../../../core/stores/useGameStore";
import { MainMenuScene } from "./MainMenuScene";

const { entitiesSystemProps, combatJuiceRendered } = vi.hoisted(() => ({
  entitiesSystemProps: vi.fn(),
  combatJuiceRendered: vi.fn(),
}));

// The scene's visual children are not under test; the test renderer cannot
// render the full scene graph, so each is replaced with an empty node.
vi.mock("../../systems/EntitiesSystem", () => ({
  EntitiesSystem: (props: Record<string, unknown>) => {
    entitiesSystemProps(props);
    return null;
  },
}));

vi.mock("../shared/Skybox", () => ({ Skybox: () => null }));
vi.mock("../shared/Light", () => ({ Light: () => null }));
vi.mock("../shared/Ground", () => ({ Ground: () => null }));
vi.mock("../../entities/Path", () => ({ Path: () => null }));
vi.mock("../../entities/effects/CombatJuice", () => ({
  CombatJuice: () => {
    combatJuiceRendered();
    return null;
  },
}));
vi.mock("./MainMenuCamera", () => ({ MainMenuCamera: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const advance = async (
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(1, 1);
  });
};

const baseEnemy = (id: number, health: number) => ({
  id,
  type: "basic" as const,
  name: "E",
  health,
  maxHealth: 100,
  speed: 1,
  reward: 3,
  color: "#fff",
  size: 0.4,
  healthLoss: 1,
  pathProgress: 0,
  pathIndex: 0,
  x: 0,
  z: 0,
  upgrades: [],
});

const levelProps = (): Record<string, unknown> =>
  entitiesSystemProps.mock.calls[
    entitiesSystemProps.mock.calls.length - 1
  ][0] as Record<string, unknown>;

describe("MainMenuScene enemy cleanup wiring", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "document", {
      value: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        visibilityState: "visible",
        documentElement: {},
      },
      configurable: true,
    });
    // CSS color tokens (scene sky, health bars) resolve through
    // getComputedStyle; return empty strings so the scene colors fall back.
    vi.stubGlobal(
      "getComputedStyle",
      vi.fn(() => ({ getPropertyValue: () => "" }))
    );
    // The scene loads level/game configs through `fetch` on the dev server
    // URL; serve the real files so the store initializes like in the app.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const relative = String(url).replace(/^\/+/, "");
        const raw = readFileSync(`public/${relative}`);
        return {
          ok: true,
          statusText: "OK",
          json: async () => JSON.parse(raw.toString()),
        };
      })
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("passes a working onEnemyReachEnd that removes the enemy", async () => {
    useGameStore.getState().setGameStatus("menu");
    const actions = enemyActions(testWorld);
    actions.clearAllEnemies();

    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <MainMenuScene />
        </EntityIdProvider>
      </WorldProvider>
    );

    try {
      for (
        let i = 0;
        i < 30 && !useLevelStore.getState().isLevelConfigLoaded;
        i++
      ) {
        await advance(renderer);
      }
      expect(useLevelStore.getState().isLevelConfigLoaded).toBe(true);

      // Death juice is mounted so menu kills (settled by EnemyDeathSystem)
      // animate with the burst + reward float.
      expect(combatJuiceRendered).toHaveBeenCalled();

      // The movement system calls this when an enemy reaches the path end;
      // an undefined handler (the old bug) leaves the enemy there forever.
      const onEnemyReachEnd = levelProps().onEnemyReachEnd;
      expect(typeof onEnemyReachEnd).toBe("function");

      actions.spawnEnemy(baseEnemy(1, 100));
      expect(getEnemySnapshots(testWorld).some((e) => e.id === 1)).toBe(true);

      (onEnemyReachEnd as (id: number) => void)(1);
      expect(
        getEnemySnapshots(testWorld).some((e) => e.id === 1)
      ).toBe(false);
    } finally {
      renderer.unmount();
      actions.clearAllEnemies();
    }
  });
});
