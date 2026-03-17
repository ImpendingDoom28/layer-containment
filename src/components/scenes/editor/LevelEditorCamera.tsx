import { PerspectiveCamera } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Vector3 } from "three";

type LevelEditorCameraProps = {
  gridSize: number;
  tileSize: number;
};

const forwardVector = new Vector3();
const rightVector = new Vector3();
const moveVector = new Vector3();
const upVector = new Vector3(0, 1, 0);

export const LevelEditorCamera = ({
  gridSize,
  tileSize,
}: LevelEditorCameraProps) => {
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
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
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

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
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

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }

      isDragging.current = true;
      lastMousePosition.current = {
        x: event.clientX,
        y: event.clientY,
      };
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }

      const deltaX = event.clientX - lastMousePosition.current.x;
      const deltaY = event.clientY - lastMousePosition.current.y;

      rotation.current.yaw -= deltaX * 0.002;
      rotation.current.pitch -= deltaY * 0.002;
      rotation.current.pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, rotation.current.pitch)
      );

      lastMousePosition.current = {
        x: event.clientX,
        y: event.clientY,
      };
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    globalThis.addEventListener("keydown", onKeyDown);
    globalThis.addEventListener("keyup", onKeyUp);
    globalThis.addEventListener("mousedown", onMouseDown);
    globalThis.addEventListener("mousemove", onMouseMove);
    globalThis.addEventListener("mouseup", onMouseUp);

    return () => {
      globalThis.removeEventListener("keydown", onKeyDown);
      globalThis.removeEventListener("keyup", onKeyUp);
      globalThis.removeEventListener("mousedown", onMouseDown);
      globalThis.removeEventListener("mousemove", onMouseMove);
      globalThis.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.position.set(0, 20, 15);
    camera.lookAt(0, 0, 0);
    rotation.current.yaw = camera.rotation.y;
    rotation.current.pitch = camera.rotation.x;
    initialized.current = true;
  }, [camera]);

  useFrame((_state, delta) => {
    if (!initialized.current) {
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

    if (moveVector.lengthSq() > 0) {
      moveVector.normalize().multiplyScalar(10 * delta);
      camera.position.add(moveVector);
    }

    const fieldSize = gridSize * tileSize;
    const minHeight = 3;
    const maxHeight = 25;

    camera.position.x = Math.max(-fieldSize, Math.min(fieldSize, camera.position.x));
    camera.position.z = Math.max(-fieldSize, Math.min(fieldSize, camera.position.z));
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
