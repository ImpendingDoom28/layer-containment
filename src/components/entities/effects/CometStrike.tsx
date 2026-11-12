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
  const revealOnImpact = useCallback(
    (impactFlat: { x: number; z: number }, simTime: number) => {
      const store = useLevelStore.getState();
      const reveal = store.cometReveal;
      if (reveal && reveal.phase === "armed") {
        store.setCometReveal({
          run: reveal.run,
          phase: "revealed",
          revealedAt: simTime,
        });
        if (!punchEmittedRef.current) {
          punchEmittedRef.current = true;
          gameEvents.emit(GameEvent.COMET_IMPACT, {
            worldPosition: impactFlat,
          });
        }
      }
    },
    []
  );

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
    // Do NOT clear `cometReveal` here. A reveal left by a previous scene is
    // already harmless: `Path` only applies it when its `run` matches the
    // level's monotonic `levelEnterRun`, and every load gets a fresh id, so a
    // stale reveal can never match the level a new scene displays. Clearing it
    // on unmount would also break React StrictMode's simulated unmount (it
    // would wipe the reveal the mount-time catch-up below just armed).
    return () => {
      unsubscribe();
    };
  }, [playStrikes]);

  // The game flow can load the level *before* this scene mounts (`startRun`
  // initializes the level while the store is reset, then the scene mounts on
  // `gameStatus` "playing"), so the `LEVEL_ENTERED` event can fire before the
  // subscription above exists and be missed — or be received by the outgoing
  // scene (the one being replaced), which arms the reveal and then unmounts
  // with no FX. Either way this scene mounts with the current run's strike not
  // yet playing. Re-arm it on mount unless it has already completed: a `null`
  // or `armed` reveal (or one for a different run) means the current run's
  // strike is not in flight here, so play it; a `revealed` reveal for the
  // current run means it already landed, so do not replay it. The `gridSize`
  // guard covers the menu → game transition: `startRun` resets the level
  // before the scene mounts, so the game scene always mounts with `gridSize`
  // 0 and never arms a stale (menu) reveal.
  useEffect(() => {
    const { levelEnterRun, gridSize, pathWaypoints, cometReveal } =
      useLevelStore.getState();
    const currentRunDone =
      cometReveal !== null &&
      cometReveal.run === levelEnterRun &&
      cometReveal.phase === "revealed";
    if (gridSize <= 0 || currentRunDone) {
      return;
    }
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
          onImpact={(simTime) => revealOnImpact(strike.flat, simTime)}
          onComplete={() => finishStrike(strike.id)}
        />
      ))}
    </>
  );
};

CometStrike.displayName = "CometStrike";
