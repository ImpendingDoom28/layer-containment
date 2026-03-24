import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";
import { PerspectiveCamera } from "@react-three/drei";
import {
  gridOffsetSelector,
  gridSizeSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { isPointerOverGameCameraBlock } from "../../../utils/isPointerOverGameCameraBlock";

// Reusable vectors to avoid GC pressure in useFrame
const forwardVector = new Vector3();
const rightVector = new Vector3();
const moveVector = new Vector3();
const upVector = new Vector3(0, 1, 0);

type GameCameraProps = {
  movementSpeed?: number;
  rotationSensitivity?: number;
  shouldDisableControls: boolean;
};

export const GameCamera = ({
  movementSpeed = 10,
  rotationSensitivity = 0.002,
  shouldDisableControls,
}: GameCameraProps) => {
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const gridOffset = useLevelStore(gridOffsetSelector);

  const { camera } = useThree();
  const moveState = useRef({
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
  });
  const isDragging = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const rotation = useRef({ pitch: 0, yaw: 0 });
  const initialized = useRef(false);

  useEffect(() => {
    if (shouldDisableControls) {
      moveState.current = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
      };
      isDragging.current = false;
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore D key when Ctrl+Shift are pressed (for debug toggle)
      if (e.code === "KeyD" && e.ctrlKey && e.shiftKey) {
        return;
      }

      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          moveState.current.forward = true;
          break;
        case "ArrowDown":
        case "KeyS":
          moveState.current.backward = true;
          break;
        case "ArrowLeft":
        case "KeyA":
          moveState.current.left = true;
          break;
        case "ArrowRight":
        case "KeyD":
          moveState.current.right = true;
          break;
        case "KeyQ":
          moveState.current.down = true;
          break;
        case "KeyE":
          moveState.current.up = true;
          break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // Ignore D key when Ctrl+Shift are pressed (for debug toggle)
      if (e.code === "KeyD" && e.ctrlKey && e.shiftKey) {
        return;
      }

      switch (e.code) {
        case "ArrowUp":
        case "KeyW":
          moveState.current.forward = false;
          break;
        case "ArrowDown":
        case "KeyS":
          moveState.current.backward = false;
          break;
        case "ArrowLeft":
        case "KeyA":
          moveState.current.left = false;
          break;
        case "ArrowRight":
        case "KeyD":
          moveState.current.right = false;
          break;
        case "KeyQ":
          moveState.current.down = false;
          break;
        case "KeyE":
          moveState.current.up = false;
          break;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      if (isPointerOverGameCameraBlock(e.clientX, e.clientY, document)) {
        return;
      }
      isDragging.current = true;
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }
      if (isPointerOverGameCameraBlock(e.clientX, e.clientY, document)) {
        lastMousePosition.current = { x: e.clientX, y: e.clientY };
        return;
      }
      const deltaX = e.clientX - lastMousePosition.current.x;
      const deltaY = e.clientY - lastMousePosition.current.y;

      rotation.current.yaw -= deltaX * rotationSensitivity;
      rotation.current.pitch -= deltaY * rotationSensitivity;

      rotation.current.pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, rotation.current.pitch)
      );

      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [rotationSensitivity, shouldDisableControls]);

  useEffect(() => {
    camera.rotation.order = "YXZ";

    const fieldCenter = new Vector3(0, 0, 0);
    camera.position.set(0, 20, 15);
    camera.lookAt(fieldCenter);

    rotation.current.yaw = camera.rotation.y;
    rotation.current.pitch = camera.rotation.x;
    initialized.current = true;
  }, [camera]);

  useFrame((_state, delta) => {
    if (!initialized.current || shouldDisableControls) {
      return;
    }

    const { forward, backward, left, right, up, down } = moveState.current;

    camera.getWorldDirection(forwardVector);
    forwardVector.y = 0;
    forwardVector.normalize();

    rightVector.crossVectors(forwardVector, upVector).normalize();

    moveVector.set(0, 0, 0);

    if (forward) {
      moveVector.add(forwardVector);
    }
    if (backward) {
      moveVector.sub(forwardVector);
    }
    if (right) {
      moveVector.add(rightVector);
    }
    if (left) {
      moveVector.sub(rightVector);
    }
    if (up) {
      moveVector.y += 1;
    }
    if (down) {
      moveVector.y -= 1;
    }

    moveVector.normalize();
    moveVector.multiplyScalar(movementSpeed * delta);

    camera.position.add(moveVector);

    const minHeight = 2;
    const maxHeight = 20;
    const fieldSize = gridSize * tileSize;
    const fieldMinX = gridOffset - 10;
    const fieldMaxX = gridOffset + fieldSize + 10;
    const fieldMinZ = gridOffset - 10;
    const fieldMaxZ = gridOffset + fieldSize + 10;

    camera.position.x = Math.max(
      fieldMinX,
      Math.min(fieldMaxX, camera.position.x)
    );
    camera.position.z = Math.max(
      fieldMinZ,
      Math.min(fieldMaxZ, camera.position.z)
    );
    camera.position.y = Math.max(
      minHeight,
      Math.min(maxHeight, camera.position.y)
    );

    camera.rotation.order = "YXZ";
    camera.rotation.y = rotation.current.yaw;
    camera.rotation.x = rotation.current.pitch;
  });

  return <PerspectiveCamera makeDefault position={[0, 20, 15]} fov={40} />;
};
