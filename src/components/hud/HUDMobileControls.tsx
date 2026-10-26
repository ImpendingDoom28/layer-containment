import { useEffect, type FC, type PointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

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

const ICONS: Record<CameraMove, ReactNode> = {
  forward: <ChevronUp />,
  backward: <ChevronDown />,
  left: <ChevronLeft />,
  right: <ChevronRight />,
  up: <ChevronUp />,
  down: <ChevronDown />,
};

/**
 * On-screen camera D-pad for the mobile control scheme (no WASD on touch
 * screens). Holding a button streams `TOUCH_CAMERA_MOVE` events to the
 * camera, exactly like a held key; releasing stops the movement. Shown only
 * on mobile viewports with the mobile scheme selected; hidden while a
 * camera-locked overlay (the upgrade panel) is up, and the camera itself
 * ignores the events while paused or a menu is open.
 */
export const HUDMobileControls: FC = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const controlScheme = useSettingsStore(controlSchemeSelector);
  const showUpgradePanel = useUpgradeStore(pendingEnemyUpgradeGateSelector);
  const { shouldLockCamera } = useGameSystem();

  const isVisible =
    isMobile && controlScheme === "mobile" && !showUpgradePanel;

  // If the pad disappears while a D-pad button is still held (upgrade panel
  // opens, scheme switches, or a viewport change), the button's release
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
    <HUDWrapper
      data-testid="mobile-dpad"
      // A tight bottom-left box (above the tower shop bar), not a full-screen
      // overlay: the wrapper is a camera-block area, so anything outside the
      // D-pad must stay clickable/draggable for placement and camera drags.
      className="inset-x-auto left-3 right-auto top-auto bottom-24"
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
              {ICONS[move]}
            </button>
          )
        )}
      </div>
    </HUDWrapper>
  );
};
