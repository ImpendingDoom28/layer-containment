import ReactThreeTestRenderer from "@react-three/test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WorldProvider } from "koota/react";

import { testWorld } from "../ecs/world";
import { EntityIdProvider } from "../contexts/EntityIdContext";
import { useGameStore } from "../stores/useGameStore";
import { useLevelStore } from "../stores/useLevelStore";
import type { Tower, TowerConfig, TowerType } from "../types/game";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../types/enums/events";
import type { LevelSystem } from "./useLevelSystem";
import { useLevelSystem } from "./useLevelSystem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const makeTowerConfig = (id: TowerType, cost: number): TowerConfig => ({
  id,
  name: id,
  cost,
  damage: 1,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
});

const makeTower = (id: number, gridX: number, gridZ: number): Tower => ({
  id,
  type: "basic",
  name: "basic",
  cost: 10,
  damage: 1,
  range: 2,
  fireRate: 1,
  targeting: "nearest",
  projectileType: "single",
  projectileSpeed: 5,
  color: "#fff",
  description: "",
  lastFireTime: 0,
  gridX,
  gridZ,
  x: gridX,
  z: gridZ,
});

let system: LevelSystem;

const Probe = () => {
  system = useLevelSystem();
  return null;
};

const deniedSpy = vi.fn();

beforeEach(() => {
  deniedSpy.mockClear();
  useLevelStore.getState().resetLevelState();
  useLevelStore.setState({
    money: 100,
    gridSize: 8,
    pathWaypoints: [],
    towers: [],
  });
  useGameStore.setState({
    towerTypes: {
      basic: makeTowerConfig("basic", 10),
    } as Record<TowerType, TowerConfig>,
    tileSize: 1,
    pathWidth: 1,
    towerHeight: 1,
  });

  gameEvents.on(GameEvent.UI_ACTION_DENIED, (data) => deniedSpy(data));
});

const renderSystem = async () => {
  const renderer = await ReactThreeTestRenderer.create(
    <WorldProvider world={testWorld}>
      <EntityIdProvider>
        <Probe />
      </EntityIdProvider>
    </WorldProvider>
  );
  return renderer;
};

describe("useLevelSystem.placeTower denial feedback", () => {
  it("emits blocked_tile when placing on an occupied tile", async () => {
    useLevelStore.setState({
      towers: [makeTower(1, 3, 3)],
    });

    const renderer = await renderSystem();
    try {
      const ok = system.placeTower(3, 3, "basic");

      expect(ok).toBe(false);
      expect(deniedSpy).toHaveBeenCalledWith({
        reason: "blocked_tile",
        towerType: "basic",
      });
    } finally {
      renderer.unmount();
    }
  });

  it("emits insufficient_funds when the tower is unaffordable", async () => {
    useLevelStore.setState({ money: 0 });

    const renderer = await renderSystem();
    try {
      const ok = system.placeTower(0, 0, "basic");

      expect(ok).toBe(false);
      expect(deniedSpy).toHaveBeenCalledWith({
        reason: "insufficient_funds",
        towerType: "basic",
      });
    } finally {
      renderer.unmount();
    }
  });

  it("fails silently when the tower type is unknown (not a player action)", async () => {
    const renderer = await renderSystem();
    try {
      const ok = system.placeTower(0, 0, "laser");

      expect(ok).toBe(false);
      expect(deniedSpy).not.toHaveBeenCalled();
    } finally {
      renderer.unmount();
    }
  });

  it("places the tower and emits no denial on a free tile", async () => {
    const renderer = await renderSystem();
    try {
      const ok = system.placeTower(1, 1, "basic");

      expect(ok).toBe(true);
      expect(deniedSpy).not.toHaveBeenCalled();
      expect(useLevelStore.getState().towers).toHaveLength(1);
      // Cost was spent (100 - 10 = 90).
      expect(useLevelStore.getState().money).toBe(90);
    } finally {
      renderer.unmount();
    }
  });

  it("prefers insufficient_funds over blocked_tile", async () => {
    useLevelStore.setState({
      money: 0,
      towers: [makeTower(1, 2, 2)],
    });

    const renderer = await renderSystem();
    try {
      const ok = system.placeTower(2, 2, "basic");

      expect(ok).toBe(false);
      expect(deniedSpy).toHaveBeenCalledWith({
        reason: "insufficient_funds",
        towerType: "basic",
      });
    } finally {
      renderer.unmount();
    }
  });
});
