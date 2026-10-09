import { useEffect, useState } from "react";
import { useActions, useQuery, useTrait, useWorld } from "koota/react";
import { Entity } from "koota";
import { Canvas } from "@react-three/fiber";
import { Html } from "@react-three/drei";

import { Position, Velocity } from "./traits/mover";
import { HealthInfo } from "./traits/health";
import { MoverSystem } from "./systems/MoverSystem";
import { HealthSystem } from "./systems/HealthSystem";
import { playerActionsFactory } from "./actions/playerActions";
import { ApplyPlayerInputSystem } from "./systems/ApplyPlayerInputSystem";
import { EcsGameCamera } from "./components/EcsGameCamera";
import { Ground } from "../components/scenes/shared/Ground";
import { Skybox } from "../components/scenes/shared/Skybox";
import { Light } from "../components/scenes/shared/Light";

export const EcsPage = () => {
  const world = useWorld();

  const playerActions = useActions(playerActionsFactory);
  const [isSpawned, setIsSpawned] = useState(false);

  useEffect(() => {
    if (isSpawned) return;

    playerActions.spawnPlayer();

    setIsSpawned(true);
  }, [isSpawned, playerActions, world]);

  return (
    <Canvas>
      <Skybox />
      <Light />
      <Ground />
      <EcsGameCamera />

      <RocketsRenderer />
      <MoverSystem />
      <HealthSystem />
      <ApplyPlayerInputSystem />
    </Canvas>
  );
};

const RocketsRenderer = () => {
  // Reactively update whenever the query updates with new entities
  const rockets = useQuery(Position, Velocity);

  return (
    <>
      {rockets.map((entity) => {
        return <Rocket key={entity} entity={entity} />;
      })}
    </>
  );
};

const Rocket = ({ entity }: { entity: Entity }) => {
  // Update then the trait values change, the component will re-render
  const position = useTrait(entity, Position);
  const healthInfo = useTrait(entity, HealthInfo);

  return (
    <Html>
      <div
        key={entity}
        style={{
          position: "absolute",
          left: position?.x ?? 0,
          top: position?.y ?? 0,
        }}
      >
        <div
          style={{
            width: `${((healthInfo?.currentHealth ?? 0) / (healthInfo?.maxHealth ?? 1)) * 100}%`,
            height: 10,
            backgroundColor: `rgba(255, 0, 0)`,
          }}
        />
        🚀
      </div>
    </Html>
  );
};
