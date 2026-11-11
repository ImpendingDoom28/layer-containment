import { FC, useCallback, useEffect, useRef, useState } from "react";
import { Quaternion } from "three";

import { useGameStore } from "../../../core/stores/useGameStore";
import { useLevelStore } from "../../../core/stores/useLevelStore";
import {
  flatFieldToSphereSurface,
  getPlanetRadius,
  getSurfaceQuaternion,
} from "../../../utils/planetSurfaceMapping";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import { useNextId } from "../../../core/hooks/utils/useNextId";
import { CometStrikeFX } from "./CometStrikeFX";

type LevelEnteredData = {
  run: number;
  portalPositions: { x: number; z: number }[];
};

type Strike = {
  id: number;
  position: [number, number, number];
  quaternion: { x: number; y: number; z: number; w: number };
  // The flat-field position the strike maps to (the camera punch aims at the
  // first portal's impact when the reveal lands).
  flat: { x: number; z: number };
};

/**
 * The level-load comet strike: when the level's state is initialized (the
 * `LEVEL_ENTERED` event, which the level store raises exactly once per load),
 * a comet streaks in from the sky and strikes each spawn portal's tile — the
 * portal is hidden while the comet flies and grows out of the scorch the
 * moment it impacts.
 *
 * This component is the single orchestrator for the reveal. On each load it:
 * (1) arms the reveal in the level store (`cometReveal` set to the load's run,
 * phase `armed`), so the scene's `Path` portals hide themselves; and (2) maps
 * the portals' flat-field positions onto the planet surface and mounts one
 * `CometStrikeFX` per portal. When a strike lands, its `onImpact` flips the
 * reveal to `revealed`, so the portals grow out of the rock in lockstep.
 *
 * It is view-side only: the FX animates on the pause-aware simulation clock,
 * and the store field is what the portals read (they match the reveal's `run`
 * against the level's id, so a stale reveal left by a previous scene is
 * ignored). One strike batch per load; the event never re-fires while a
 * scene is alive, so the orchestrator never re-arms mid-flight.
 */
export const CometStrike: FC = () => {
  const { getNextId } = useNextId();
  const [strikes, setStrikes] = useState<Strike[]>([]);
  // Emits the camera punch once per load: the first strike to land flips the
  // reveal (armed → revealed) and aims the punch at the first portal's impact.
  const punchEmittedRef = useRef(false);

  const finishStrike = useCallback((id: number) => {
    setStrikes((prev) => prev.filter((strike) => strike.id !== id));
  }, []);

  // Reveal the active comet when a strike lands: flip the in-flight reveal
  // (phase `armed`) to `revealed`. There is a single active reveal at a time
  // (one store field), so every strike of the same load shares this one
  // stable callback and they all reveal the same run. The armed → revealed
  // flip is the once-per-load guard: only the first strike to land flips it
  // (the later strikes of the same load find it already `revealed`), so the
  // camera punch fires exactly once, aimed at the first portal's impact.
  const revealOnImpact = useCallback((impactFlat: { x: number; z: number }) => {
    const store = useLevelStore.getState();
    const reveal = store.cometReveal;
    if (reveal && reveal.phase === "armed") {
      store.setCometReveal({ run: reveal.run, phase: "revealed" });
      if (!punchEmittedRef.current) {
        punchEmittedRef.current = true;
        gameEvents.emit(GameEvent.COMET_IMPACT, {
          worldPosition: impactFlat,
        });
      }
    }
  }, []);

  // Arm the reveal and mount a `CometStrikeFX` for each spawn portal of the
  // given load. `run` is the load's unique id; `flats` are the portals'
  // flat-field positions (mapped onto the planet surface here).
  const playStrikes = useCallback(
    (run: number, flats: { x: number; z: number }[]) => {
      const { gridSize } = useLevelStore.getState();
      const { tileSize } = useGameStore.getState();
      if (flats.length === 0 || gridSize <= 0 || tileSize <= 0) return;
      const radius = getPlanetRadius(gridSize, tileSize);

      // Arm the reveal first (before the FX mounts) so the portals are
      // hidden from the very first frame of the comet's flight. A fresh load
      // also re-arms the camera-punch guard, so the next load punches again.
      useLevelStore.getState().setCometReveal({ run, phase: "armed" });
      punchEmittedRef.current = false;

      setStrikes(
        flats.map((flat) => {
          const { surfacePoint, normal } = flatFieldToSphereSurface(
            flat.x,
            flat.z,
            radius
          );
          const impact = surfacePoint.clone().addScaledVector(normal, 0.05);
          const quaternion = getSurfaceQuaternion(normal);
          return {
            id: getNextId(),
            position: [impact.x, impact.y, impact.z] as [
              number,
              number,
              number,
            ],
            quaternion: {
              x: quaternion.x,
              y: quaternion.y,
              z: quaternion.z,
              w: quaternion.w,
            },
            flat,
          };
        })
      );
    },
    [getNextId]
  );

  useEffect(() => {
    const onLevelEntered = (data: LevelEnteredData) => {
      playStrikes(data.run, data.portalPositions ?? []);
    };

    const unsubscribe = gameEvents.on<LevelEnteredData>(
      GameEvent.LEVEL_ENTERED,
      onLevelEntered
    );
    // Clear the reveal when this scene goes away (a scene transition), so a
    // stale armed/revealed state does not leak into the next scene's portals.
    return () => {
      unsubscribe();
      useLevelStore.getState().setCometReveal(null);
    };
  }, [playStrikes]);

  // The game flow loads the level *before* this scene mounts (`startRun`
  // initializes the level, then the scene mounts on `gameStatus` "playing"),
  // so the `LEVEL_ENTERED` event fires before the subscription above exists.
  // The level store retains the last load id no scene has consumed
  // (`unseenLevelEnterRun`); if it still points at the current load when this
  // scene mounts, replay the strike once. The `gridSize` guard keeps it from
  // firing after a level reset (the store is cleared to `gridSize` 0, which
  // also means the retained id is a stale one, e.g. the menu's level, not the
  // game's).
  useEffect(() => {
    const {
      levelEnterRun,
      gridSize,
      pathWaypoints,
      unseenLevelEnterRun,
    } = useLevelStore.getState();
    if (
      unseenLevelEnterRun === null ||
      unseenLevelEnterRun !== levelEnterRun ||
      gridSize <= 0
    ) {
      return;
    }
    useLevelStore.getState().setUnseenLevelEnterRun(null);
    playStrikes(
      levelEnterRun,
      pathWaypoints
        .filter((path) => path.length > 0)
        .map((path) => ({ x: path[0].x, z: path[0].z }))
    );
  }, [playStrikes]);

  if (strikes.length === 0) return null;
  return (
    <>
      {strikes.map((strike) => (
        <CometStrikeFX
          key={strike.id}
          position={strike.position}
          quaternion={
            new Quaternion(
              strike.quaternion.x,
              strike.quaternion.y,
              strike.quaternion.z,
              strike.quaternion.w
            )
          }
          onImpact={() => revealOnImpact(strike.flat)}
          onComplete={() => finishStrike(strike.id)}
        />
      ))}
    </>
  );
};

CometStrike.displayName = "CometStrike";
