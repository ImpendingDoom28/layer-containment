import {
  useEffect,
  useRef,
  type FC,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import { Icon, type IconName } from "../ui/Icon";
import {
  CAMERA_MOVE_BINDINGS,
  type CameraMove,
} from "../../core/keybindingsConstants";
import { useIsMobile } from "../../core/hooks/useIsMobile";
import { useGameSystem } from "../../core/hooks/useGameSystem";
import {
  controlSchemeSelector,
  useSettingsStore,
} from "../../core/stores/useSettingsStore";
import {
  pendingEnemyUpgradeGateSelector,
  useUpgradeStore,
} from "../../core/stores/useUpgradeStore";
import { gameEvents } from "../../utils/eventEmitter";
import { GameEvent } from "../../core/types/enums/events";
import { HUDWrapper } from "./HUDWrapper";
import { cn } from "../ui/lib/twUtils";

// The six camera moves laid out as a numpad 3x3 grid, mirroring the mobile
// scheme's number-row bindings (8=forward, 2=backward, 4=left, 6=right,
// 9=up, 3=down) so each button sits where its physical key is. null cells
// (7, 5, 1) are spacers.
const DPAD_CELLS: (CameraMove | null)[] = [
  null, // 7
  "forward", // 8
  "up", // 9
  "left", // 4
  null, // 5
  "right", // 6
  null, // 1
  "backward", // 2
  "down", // 3
];

const ICONS: Record<CameraMove, IconName> = {
  forward: "ChevronUp",
  backward: "ChevronDown",
  left: "ChevronLeft",
  right: "ChevronRight",
  up: "ChevronUp",
  down: "ChevronDown",
};

// Rotation joystick geometry. The knob is clamped to a circle so the drag
// feels like a thumbstick; each move emits the incremental pixel delta the
// camera multiplies by its rotation sensitivity (the same math as a mouse
// drag).
const JOYSTICK_SIZE = 120;
const KNOB_SIZE = 48;
const KNOB_MAX_OFFSET = (JOYSTICK_SIZE - KNOB_SIZE) / 2;

const clampOffset = (value: number, max: number) =>
  Math.max(-max, Math.min(max, value));

/**
 * Drag joystick that rotates the camera (the touch analog of mouse-drag).
 * Touch and drag the knob: horizontal drags look left/right (yaw), vertical
 * drags look up/down (pitch). The knob springs back to center on release.
 * Emitted as incremental `TOUCH_CAMERA_ROTATE` deltas, so the camera applies
 * them exactly like a mouse drag.
 */
export const MobileRotationJoystick: FC<{
  disabled: boolean;
}> = ({ disabled }) => {
  const { t } = useTranslation();
  const knobRef = useRef<HTMLDivElement | null>(null);
  // Only the first pointer drives the stick; the rest are ignored so a second
  // finger (e.g. on the D-pad) doesn't hijack the rotation.
  const activePointerId = useRef<number | null>(null);
  const lastPos = useRef({ x: 0, y: 0 });
  const origin = useRef({ x: 0, y: 0 });

  const emitDelta = (deltaX: number, deltaY: number) => {
    if (deltaX === 0 && deltaY === 0) {
      return;
    }
    gameEvents.emit(GameEvent.TOUCH_CAMERA_ROTATE, { deltaX, deltaY });
  };

  const resetKnob = () => {
    if (knobRef.current) {
      knobRef.current.style.transform = "translate(-50%, -50%)";
    }
    activePointerId.current = null;
  };

  const handlePointerDown = (event: PointerEvent) => {
    if (disabled || activePointerId.current !== null) {
      return;
    }
    event.preventDefault();
    activePointerId.current = event.pointerId;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    lastPos.current = { x: event.clientX, y: event.clientY };
    origin.current = { x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId.current) {
      return;
    }
    // Incremental delta since the previous move; the camera accumulates it.
    const deltaX = event.clientX - lastPos.current.x;
    const deltaY = event.clientY - lastPos.current.y;
    lastPos.current = { x: event.clientX, y: event.clientY };
    emitDelta(deltaX, deltaY);

    // The knob mirrors the finger, clamped to the stick radius.
    if (knobRef.current) {
      const dx = clampOffset(event.clientX - origin.current.x, KNOB_MAX_OFFSET);
      const dy = clampOffset(event.clientY - origin.current.y, KNOB_MAX_OFFSET);
      knobRef.current.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
  };

  const handlePointerEnd = (event: PointerEvent) => {
    if (event.pointerId !== activePointerId.current) {
      return;
    }
    resetKnob();
  };

  return (
    <div
      data-testid="mobile-joystick"
      role="group"
      aria-label={t("controls.rotateCamera")}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onLostPointerCapture={handlePointerEnd}
      onContextMenu={(event) => event.preventDefault()}
      style={{ width: JOYSTICK_SIZE, height: JOYSTICK_SIZE }}
      className="relative touch-none select-none rounded-full border border-border bg-card/60 backdrop-blur-sm disabled:opacity-40"
    >
      {/* Center marker */}
      <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border" />
      <div
        ref={knobRef}
        data-testid="mobile-joystick-knob"
        className={cn(
          "absolute left-1/2 top-1/2 rounded-full border border-border bg-card/90 shadow-sm",
          disabled ? "opacity-40" : "active:bg-primary/20"
        )}
        style={{
          width: KNOB_SIZE,
          height: KNOB_SIZE,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
};

/**
 * On-screen camera controls for the mobile control scheme (no WASD on touch
 * screens). Two clusters, in a two-thumb layout:
 * - Left: a rotation joystick (touch analog of mouse-drag).
 * - Right: a D-pad that holds/releases camera moves, exactly like a held key.
 * Shown only on mobile viewports with the mobile scheme selected; hidden
 * while a camera-locked overlay (the upgrade panel) is up, and the camera
 * itself ignores the events while paused or a menu is open.
 */
export const HUDMobileControls: FC = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const controlScheme = useSettingsStore(controlSchemeSelector);
  const showUpgradePanel = useUpgradeStore(pendingEnemyUpgradeGateSelector);
  const { shouldLockCamera } = useGameSystem();

  const isVisible = isMobile && controlScheme === "mobile" && !showUpgradePanel;

  // If the controls disappear while a D-pad button is still held (upgrade
  // panel opens, scheme switches, or a viewport change), the button's release
  // handler can no longer fire. Release every move in the visibility cleanup
  // so no stale move keeps the camera moving.
  useEffect(() => {
    if (!isVisible) {
      return;
    }
    return () => {
      for (const move of Object.keys(ICONS) as CameraMove[]) {
        gameEvents.emit(GameEvent.TOUCH_CAMERA_MOVE, { move, down: false });
      }
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const emitMove = (move: CameraMove, down: boolean) => {
    gameEvents.emit(GameEvent.TOUCH_CAMERA_MOVE, { move, down });
  };

  const handlePointerDown = (move: CameraMove) => (event: PointerEvent) => {
    event.preventDefault();
    // Keep the pointer on the button so a slip off its edge still counts as a
    // release (pointerup then fires on the capturing element).
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    emitMove(move, true);
  };

  const handlePointerEnd = (move: CameraMove) => () => {
    emitMove(move, false);
  };

  return (
    <>
      <HUDWrapper
        data-testid="mobile-joystick-wrap"
        // A tight bottom-left box (above the tower shop bar): the wrapper is a
        // camera-block area, so the surrounding field stays draggable for
        // placement and mouse camera-drag.
        className="inset-x-auto left-3 right-auto top-auto bottom-24 "
      >
        <MobileRotationJoystick disabled={shouldLockCamera} />
      </HUDWrapper>

      <HUDWrapper
        data-testid="mobile-dpad"
        // A tight bottom-right box (above the tower shop bar), opposite the
        // joystick: two-thumb layout (left = look, right = move).
        className="inset-x-auto left-auto right-3 top-auto bottom-24"
      >
        <div
          className="grid grid-cols-3 grid-rows-3 gap-1"
          role="group"
          aria-label={t("settings.controls")}
        >
          {DPAD_CELLS.map((move, index) =>
            move === null ? (
              <div key={index} />
            ) : (
              <button
                key={move}
                type="button"
                data-testid={`mobile-dpad-${move}`}
                aria-label={t(`controls.${CAMERA_MOVE_BINDINGS[move]}`)}
                disabled={shouldLockCamera}
                onPointerDown={handlePointerDown(move)}
                onPointerUp={handlePointerEnd(move)}
                onPointerCancel={handlePointerEnd(move)}
                onLostPointerCapture={handlePointerEnd(move)}
                onContextMenu={(event) => event.preventDefault()}
                className={cn(
                  "flex h-11 w-11 touch-none select-none items-center justify-center rounded-none border border-border bg-card/80 text-foreground backdrop-blur-sm active:bg-primary/20 disabled:opacity-40 focus-visible:ring-1 focus-visible:ring-ring"
                )}
              >
                <Icon name={ICONS[move]} size={24} />
              </button>
            )
          )}
        </div>
      </HUDWrapper>
    </>
  );
};
