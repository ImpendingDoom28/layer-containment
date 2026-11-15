import { readFileSync } from "node:fs";
import type { FC } from "react";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import { useFrame } from "@react-three/fiber";
import { type Clock } from "three";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { WorldProvider } from "koota/react";

import { EntityIdProvider } from "../../../core/contexts/EntityIdContext";
import { SimulationClockProvider } from "../../../core/contexts/SimulationClockContext";
import { enemyActions } from "../../../core/ecs/actions/enemyActions";
import { testWorld } from "../../../core/ecs/world";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import { useGameStore } from "../../../core/stores/useGameStore";
import { MainMenuScene } from "./MainMenuScene";

// The scene's visual children are not under test; the test renderer cannot
// render the full scene graph, so each is replaced with an empty node.
const entitiesSystemProps = vi.fn();
const combatJuiceRendered = vi.fn();

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
vi.mock("../../entities/Grid", () => ({ Grid: () => null }));
vi.mock("../../entities/PlanetTileDecorations", () => ({
  PlanetTileDecorations: () => null,
}));
vi.mock("../../entities/effects/CombatJuice", () => ({
  CombatJuice: () => {
    combatJuiceRendered();
    return null;
  },
}));
// The comet orchestrator is the scene's reveal driver; the spawn-gate test
// arms the reveal directly in the level store instead.
vi.mock("../../entities/effects/CometStrike", () => ({
  CometStrike: () => null,
}));
vi.mock("./MainMenuCamera", () => ({ MainMenuCamera: () => null }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>;

const advance = async (renderer: Renderer) => {
  await ReactThreeTestRenderer.act(async () => {
    await renderer.advanceFrames(1, 1);
  });
};

describe("MainMenuScene shared scene wiring", () => {
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
        // loadFile fetches configs as root-absolute paths over http; read
        // the file by its path component.
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

  // The ambient spawns leave entities in the shared test world and the test
  // arms a comet reveal in the level store; keep both clean between tests.
  beforeEach(() => {
    enemyActions(testWorld).clearAllEnemies();
    useLevelStore.getState().setCometReveal(null);
  });

  const mountScene = async () => {
    useGameStore.getState().setGameStatus("menu");
    const renderer = await ReactThreeTestRenderer.create(
      <WorldProvider world={testWorld}>
        <EntityIdProvider>
          <SimulationClockProvider>
            <ClockCapture />
            <MainMenuScene />
          </SimulationClockProvider>
        </EntityIdProvider>
      </WorldProvider>
    );
    // The config loads in effects during `create`, so frames usually never
    // run; wait for the load flag regardless of which one delivered it.
    for (
      let i = 0;
      i < 30 && !useLevelStore.getState().isLevelConfigLoaded;
      i++
    ) {
      await advance(renderer);
    }
    expect(useLevelStore.getState().isLevelConfigLoaded).toBe(true);
    // One explicit frame so the capture hook below registers the R3F clock.
    await advance(renderer);
    return renderer;
  };

  // The test renderer's `advanceFrames` calls the `useFrame` callbacks with
  // `(state, delta)` but does not advance `state.clock` (see
  // `GameSessionSystem.test.tsx`, which sets `clock.elapsedTime` by hand);
  // the scene's spawn timer reads the simulation clock derived from it, so
  // each frame is run at an explicit clock time.
  const clockRef: { current: Clock | null } = { current: null };
  const ClockCapture: FC = () => {
    useFrame((state) => {
      clockRef.current = state.clock as Clock;
    });
    return null;
  };

  const advanceTo = async (renderer: Renderer, targetSeconds: number) => {
    const clock = clockRef.current;
    if (!clock) throw new Error("R3F clock was not captured");
    const from = clock.elapsedTime;
    if (targetSeconds <= from) return;
    const frames = Math.ceil((targetSeconds - from) * 60);
    await ReactThreeTestRenderer.act(async () => {
      for (let i = 1; i <= frames; i++) {
        clock.elapsedTime = from + ((targetSeconds - from) * i) / frames;
        await renderer.advanceFrames(1, 1 / 60);
      }
    });
  };

  it("loads the menu level and mounts shared entity presentation", async () => {
    const renderer = await mountScene();

    try {
      expect(combatJuiceRendered).toHaveBeenCalled();
      expect(entitiesSystemProps).toHaveBeenCalled();
    } finally {
      renderer.unmount();
    }
  });

  it("holds ambient enemy spawns until the spawn portals have settled", async () => {
    const renderer = await mountScene();

    try {
      const clock = clockRef.current as Clock;
      clock.elapsedTime = 0;
      const run = useLevelStore.getState().levelEnterRun;

      // The comet reveal is armed by the scene's `CometStrike` orchestrator
      // (mocked here), so arm it directly: the comet is in flight and the
      // spawn portals are not on the ground yet.
      useLevelStore.getState().setCometReveal({ run, phase: "armed" });

      // Long past the 0.5-2s spawn interval: without the gate the menu would
      // already be spawning.
      await advanceTo(renderer, 1);
      expect(enemyActions(testWorld).getLivingEnemyCount()).toBe(0);

      // The comet strikes at sim time 3.0: the reveal flips to `revealed`
      // with the impact's simulation time (the same clock the scene's spawn
      // timer reads). The portals rise out of the scorch for 1.0s plus a
      // 0.3s settle buffer, so they settle at sim time 4.3.
      useLevelStore.getState().setCometReveal({
        run,
        phase: "revealed",
        revealedAt: 3.0,
      });

      // Still rising (0.2s before the settle time): no spawns.
      await advanceTo(renderer, 4.2);
      expect(enemyActions(testWorld).getLivingEnemyCount()).toBe(0);

      // Settled: the ambient spawns resume.
      await advanceTo(renderer, 5);
      expect(enemyActions(testWorld).getLivingEnemyCount()).toBeGreaterThan(0);
    } finally {
      renderer.unmount();
    }
  });
});
