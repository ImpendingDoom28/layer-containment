import { useThree, useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { MathUtils, PerspectiveCamera as ThreePerspectiveCamera, Vector3 } from "three";
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
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import type { UiActionDeniedData } from "../../../core/types/game";
import {
  MS_PER_SECOND,
  UI_ACTION_DENIED_CAMERA_SHAKE_AMPLITUDE,
  UI_ACTION_DENIED_CAMERA_SHAKE_DURATION_MS,
  UI_ACTION_DENIED_CAMERA_SHAKE_FREQ_X,
  UI_ACTION_DENIED_CAMERA_SHAKE_FREQ_Y,
  UI_ACTION_DENIED_CAMERA_SHAKE_FREQ_Z,
  UI_ACTION_DENIED_CAMERA_SHAKE_SCALE_XZ,
  UI_ACTION_DENIED_CAMERA_SHAKE_SCALE_Y,
} from "../../../constants/uiActionDeniedFeedback";
import {
  PAUSE_FOV_BASE,
  PAUSE_FOV_DAMP_LAMBDA,
  PAUSE_FOV_MIN,
} from "../../../constants/pauseVisuals";
import { getCameraMovesForEvent } from "../../../core/keybindings";
import type { CameraMove } from "../../../core/keybindingsConstants";
import {
  controlSchemeSelector,
  keybindingsSelector,
  useSettingsStore,
} from "../../../core/stores/useSettingsStore";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";

// Reusable vectors to avoid GC pressure in useFrame
const forwardVector = new Vector3();
const rightVector = new Vector3();
const moveVector = new Vector3();
const upVector = new Vector3(0, 1, 0);

// Mirrors R3F's click-distance threshold: below it a pointerdown+up counts as
// a genuine click, beyond it as a drag.
const CLICK_DRAG_THRESHOLD = 2;

type GameCameraProps = {
  movementSpeed?: number;
  rotationSensitivity?: number;
  shouldStopCamera: boolean;
  /** Eases the field of view into a tighter frame while paused. */
  paused: boolean;
};

export const GameCamera = ({
  movementSpeed = 10,
  rotationSensitivity = 0.002,
  shouldStopCamera,
  paused,
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
  const dragTravelRef = useRef(0);
  const suppressClickRef = useRef(false);
  const rotation = useRef({ pitch: 0, yaw: 0 });
  const initialized = useRef(false);
  const shakeOffsetRef = useRef(new Vector3());
  const shakeRemainingMsRef = useRef(0);
  const fovRef = useRef(PAUSE_FOV_BASE);
  const keybindings = useSettingsStore(keybindingsSelector);
  const controlScheme = useSettingsStore(controlSchemeSelector);
  const reducedMotion = useReducedMotion();

  // The HUD denial shake is driven by `HudAnimationSystem` (DOM side); the
  // camera only adds its own shake.
  useEffect(() => {
    const unsubscribe = gameEvents.on<UiActionDeniedData>(
      GameEvent.UI_ACTION_DENIED,
      (data) => {
        if (!data) {
          return;
        }
        if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          shakeRemainingMsRef.current = UI_ACTION_DENIED_CAMERA_SHAKE_DURATION_MS;
        }
      }
    );
    return unsubscribe;
  }, []);

  // On-screen D-pad (mobile control scheme): the pad holds/releases camera
  // moves through the event emitter, the same source of truth as physical
  // keys. Only wired while the mobile scheme is active so keyboard players
  // don't pay for a dead listener.
  useEffect(() => {
    if (controlScheme !== "mobile") {
      return;
    }

    const handleTouchMove = (data: { move: CameraMove; down: boolean }) => {
      if (!data || shouldStopCamera) {
        return;
      }
      moveState.current[data.move] = data.down;
    };

    // Rotation joystick: incremental pixel deltas, applied to yaw/pitch the
    // same way the mouse-drag path does (delta * sensitivity, pitch clamped).
    const handleTouchRotate = (data: { deltaX: number; deltaY: number }) => {
      if (!data || shouldStopCamera) {
        return;
      }
      rotation.current.yaw -= data.deltaX * rotationSensitivity;
      rotation.current.pitch -= data.deltaY * rotationSensitivity;
      rotation.current.pitch = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, rotation.current.pitch)
      );
    };

    const unsubscribe = gameEvents.on(
      GameEvent.TOUCH_CAMERA_MOVE,
      handleTouchMove
    );
    const unsubscribeRotate = gameEvents.on(
      GameEvent.TOUCH_CAMERA_ROTATE,
      handleTouchRotate
    );
    return () => {
      unsubscribe();
      unsubscribeRotate();
      // The pad (or the scheme) can hide while a D-pad button is still held,
      // so clear the flags it set instead of letting a stale move drive the
      // camera.
      moveState.current = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
      };
    };
  }, [controlScheme, shouldStopCamera, rotationSensitivity]);

  useEffect(() => {
    if (shouldStopCamera) {
      moveState.current = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        up: false,
        down: false,
      };
      isDragging.current = false;
      dragTravelRef.current = 0;
      suppressClickRef.current = false;
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      for (const move of getCameraMovesForEvent(keybindings, e, "down")) {
        moveState.current[move] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      for (const move of getCameraMovesForEvent(keybindings, e, "up")) {
        moveState.current[move] = false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) {
        return;
      }
      if (isPointerOverGameCameraBlock(e.clientX, e.clientY)) {
        return;
      }
      isDragging.current = true;
      dragTravelRef.current = 0;
      suppressClickRef.current = false;
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }
      if (isPointerOverGameCameraBlock(e.clientX, e.clientY)) {
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

      dragTravelRef.current += Math.hypot(deltaX, deltaY);
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    };

    // While the camera is being dragged R3F raycasts the whole scene on every
    // pointermove (its listener sits on the container, bubble phase). That cost
    // is unrelated to frustum culling — three tests `layers`, not `visible` —
    // so it runs even for culled objects. Stop the pointermove in the capture
    // phase (window is an ancestor, so this runs first) so the drag stays cheap.
    //
    // The suppressed moves leave two stale side effects, handled here:
    // 1. R3F only dispatches `onClick` to objects hit at pointerdown, so a
    //    short camera nudge (past R3F's 2px click threshold but small enough
    //    that the cursor still sits over the same tile) would still place a
    //    tower on release. The `click` fires after `mouseup`, so the "this was
    //    a far drag" flag is set on mouseup and consumed by the capture-phase
    //    click handler, which swallows the click before R3F sees it.
    // 2. With no pointermove R3F never runs `cancelPointer`, so the hover
    //    highlight of the tile the drag started on stays stuck. On release we
    //    re-dispatch a pointermove on the canvas at the final position so R3F
    //    recomputes the hover and clears it.
    const handlePointerMoveCapture = (e: PointerEvent) => {
      if (isDragging.current) {
        e.stopPropagation();
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      if (isDragging.current) {
        // Released outside the window: no mouseup ran, treat as a drag.
        isDragging.current = false;
        dragTravelRef.current = 0;
        suppressClickRef.current = false;
        e.stopPropagation();
        return;
      }
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        e.stopPropagation();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!isDragging.current) {
        return;
      }
      isDragging.current = false;
      suppressClickRef.current = dragTravelRef.current > CLICK_DRAG_THRESHOLD;
      dragTravelRef.current = 0;
      if (!isPointerOverGameCameraBlock(e.clientX, e.clientY)) {
        const canvas = (e.target as HTMLElement).closest("canvas");
        if (canvas) {
          // The browser derives offsetX/offsetY from clientX/clientY and the
          // target for untrusted events, so R3F's raycast gets the right
          // coordinates without them being set explicitly.
          canvas.dispatchEvent(
            new PointerEvent("pointermove", {
              clientX: e.clientX,
              clientY: e.clientY,
              pointerId: 1,
              isPrimary: true,
              pointerType: "mouse",
              bubbles: true,
            })
          );
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("pointermove", handlePointerMoveCapture, true);
    window.addEventListener("click", handleClickCapture, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("pointermove", handlePointerMoveCapture, true);
      window.removeEventListener("click", handleClickCapture, true);
    };
  }, [rotationSensitivity, shouldStopCamera, keybindings]);

  useEffect(() => {
    camera.rotation.order = "YXZ";

    const fieldCenter = new Vector3(0, 0, 0);
    camera.position.set(0, 20, 15);
    camera.lookAt(fieldCenter);

    rotation.current.yaw = camera.rotation.y;
    rotation.current.pitch = camera.rotation.x;
    initialized.current = true;
  }, [camera]);

  // Ease the field of view into a tighter frame while paused (and back on
  // resume). Kept separate from the movement frame below so the zoom works
  // even when the camera is locked. Under reduced motion the fov snaps to
  // its target instead of animating.
  useFrame((_, delta) => {
    const target = paused ? PAUSE_FOV_MIN : PAUSE_FOV_BASE;
    const next = reducedMotion
      ? target
      : MathUtils.damp(fovRef.current, target, PAUSE_FOV_DAMP_LAMBDA, delta);
    if (Math.abs(next - fovRef.current) < 0.001) {
      return;
    }
    fovRef.current = next;
    if (camera instanceof ThreePerspectiveCamera) {
      camera.fov = next;
      camera.updateProjectionMatrix();
    }
  });

  useFrame((state, delta) => {
    if (!initialized.current || shouldStopCamera) {
      return;
    }

    camera.position.sub(shakeOffsetRef.current);

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

    const shakeMs = shakeRemainingMsRef.current;
    if (shakeMs > 0) {
      const decMs = delta * MS_PER_SECOND;
      shakeRemainingMsRef.current = Math.max(0, shakeMs - decMs);
      const fade = shakeMs / UI_ACTION_DENIED_CAMERA_SHAKE_DURATION_MS;
      const amp = UI_ACTION_DENIED_CAMERA_SHAKE_AMPLITUDE * fade;
      const t = state.clock.elapsedTime;
      shakeOffsetRef.current.set(
        Math.sin(t * UI_ACTION_DENIED_CAMERA_SHAKE_FREQ_X) *
          amp *
          UI_ACTION_DENIED_CAMERA_SHAKE_SCALE_XZ,
        Math.sin(t * UI_ACTION_DENIED_CAMERA_SHAKE_FREQ_Y) *
          amp *
          UI_ACTION_DENIED_CAMERA_SHAKE_SCALE_Y,
        Math.cos(t * UI_ACTION_DENIED_CAMERA_SHAKE_FREQ_Z) *
          amp *
          UI_ACTION_DENIED_CAMERA_SHAKE_SCALE_XZ
      );
    } else {
      shakeOffsetRef.current.set(0, 0, 0);
    }

    camera.position.add(shakeOffsetRef.current);

    camera.rotation.order = "YXZ";
    camera.rotation.y = rotation.current.yaw;
    camera.rotation.x = rotation.current.pitch;
  });

  return <PerspectiveCamera makeDefault position={[0, 20, 15]} fov={40} />;
};
