import { useEffect } from "react";
import { useActions, useQueryFirst } from "koota/react";

import { inputActions } from "../actions/inputActions";
import { isPlayer } from "../traits/player";

export const ApplyPlayerInputSystem = () => {
  const actions = useActions(inputActions);

  const player = useQueryFirst(isPlayer);

  useEffect(() => {
    if (!player) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          actions.updateDirection(player, { forward: true });
          break;
        case "ArrowDown":
        case "KeyS":
          actions.updateDirection(player, { backward: true });
          break;
        case "ArrowLeft":
        case "KeyA":
          actions.updateDirection(player, { left: true });
          break;
        case "ArrowRight":
        case "KeyD":
          actions.updateDirection(player, { right: true });
          break;
        case "KeyQ":
          actions.updateDirection(player, { down: true });
          break;
        case "KeyE":
          actions.updateDirection(player, { up: true });
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          actions.updateDirection(player, { forward: false });
          break;
        case "ArrowDown":
        case "KeyS":
          actions.updateDirection(player, { backward: false });
          break;
        case "ArrowLeft":
        case "KeyA":
          actions.updateDirection(player, { left: false });
          break;
        case "ArrowRight":
        case "KeyD":
          actions.updateDirection(player, { right: false });
          break;
        case "KeyQ":
          actions.updateDirection(player, { down: false });
          break;
        case "KeyE":
          actions.updateDirection(player, { up: false });
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [actions, player]);

  return null;
};
