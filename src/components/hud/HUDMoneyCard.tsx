import { FC, useEffect, useRef } from "react";

import { useMoneyCounter } from "../../core/hooks/useMoneyCounter";
import { moneySelector, useLevelStore } from "../../core/stores/useLevelStore";
import { GameEvent } from "../../core/types/enums/events";
import type { MoneyChangedData } from "../../core/types/game";
import { gameEvents } from "../../utils/eventEmitter";
import { UIMoney } from "../ui/UIMoney";
import type { UITypographyProps } from "../ui/UITypography";

const FLASH_CLASS = "is-flashing";
const FLASH_DURATION_MS = 600;

type HUDMoneyCardProps = {
  variant?: UITypographyProps["variant"];
  iconSize?: number;
  className?: string;
};

/**
 * The HUD money display: the number eases to its new value (~250ms ease-out,
 * pure DOM — no 3D cost) and the money's own color briefly changes on every
 * change — gold on a gain, red on a spend.
 *
 * The color change is driven by the `MONEY_CHANGED` game event (the store
 * raises it on every gain/spend), so it is view-side and never touches the
 * simulation. `is-flashing` + `data-money-flash` live on the money wrapper;
 * the CSS animates a hue-rotate/saturate/brightness `filter` on it that
 * remaps the green glyphs (icon + number) onto the target color and back.
 * Re-triggering uses the standard remove-class / force-reflow / re-add
 * dance. Skipped under `prefers-reduced-motion` (the CSS drops the
 * animation; the hook snaps).
 */
export const HUDMoneyCard: FC<HUDMoneyCardProps> = ({
  variant = "medium",
  iconSize,
  className,
}) => {
  const money = useLevelStore(moneySelector);
  const displayed = useMoneyCounter(money);
  const flashRef = useRef<HTMLSpanElement | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onMoneyChanged = (data: MoneyChangedData | undefined) => {
      if (!data) return;
      const element = flashRef.current;
      if (!element) return;

      element.dataset["moneyFlash"] = data.direction;
      element.classList.remove(FLASH_CLASS);
      // Force a reflow so re-adding the class restarts the animation even when
      // the previous flash is still running (rapid gains/spends).
      void element.offsetWidth;
      element.classList.add(FLASH_CLASS);

      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => {
        element.classList.remove(FLASH_CLASS);
        clearTimerRef.current = null;
      }, FLASH_DURATION_MS);
    };

    const unsubscribe = gameEvents.on<MoneyChangedData>(
      GameEvent.MONEY_CHANGED,
      onMoneyChanged
    );
    return () => {
      unsubscribe();
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, []);

  return (
    <span
      ref={flashRef}
      data-testid="money-card-flash"
      data-money-flash="increase"
      className={`money-flash inline-flex items-center ${className ?? ""}`}
    >
      <UIMoney money={displayed} variant={variant} iconSize={iconSize} />
    </span>
  );
};

HUDMoneyCard.displayName = "HUDMoneyCard";
