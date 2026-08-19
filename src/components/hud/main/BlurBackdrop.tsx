import { FC, useLayoutEffect, useState } from "react";
import { cn, twTranslateXPercentFromViewportWidth } from "../../ui/lib/twUtils";

type BlurBackdropProps = {
  isMenu: boolean;
  blurDimensions: { width: string; height: string };
  setBlurDimensions: (dimensions: { width: string; height: string }) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  hasInteracted: boolean;
};

export const BlurBackdrop: FC<BlurBackdropProps> = ({
  isMenu,
  blurDimensions,
  setBlurDimensions,
  menuRef,
  hasInteracted,
}) => {
  const [viewportWidthPx, setViewportWidthPx] = useState(0);
  const [blurTranslateReferenceWidthPx, setBlurTranslateReferenceWidthPx] =
    useState(0);

  useLayoutEffect(() => {
    const updateLayoutMetrics = () => {
      setViewportWidthPx(window.innerWidth);
      if (menuRef.current) {
        const h = menuRef.current.clientHeight;
        const w = menuRef.current.clientWidth;

        setBlurTranslateReferenceWidthPx(h);
        setBlurDimensions({
          width: `${h}px`,
          height: `${w}px`,
        });
      }
    };

    updateLayoutMetrics();
    window.addEventListener("resize", updateLayoutMetrics);
    return () => window.removeEventListener("resize", updateLayoutMetrics);
    // Recalculate the dimensions when the menu is interacted with
  }, [menuRef, setBlurDimensions, hasInteracted]);

  const blurTwTranslateX = (() => {
    if (isMenu && viewportWidthPx > 0 && blurTranslateReferenceWidthPx > 0) {
      return twTranslateXPercentFromViewportWidth(
        viewportWidthPx,
        blurTranslateReferenceWidthPx,
        -100
      );
    }
    return "-50%";
  })();

  return (
    <div
      className={cn(
        "absolute inset-0 z-10",
        hasInteracted ? "opacity-100" : "opacity-0"
      )}
    >
      <div
        className="absolute top-0 left-0 bg-gradient-to-r from-black/75 to-transparent h-dvh"
        style={{
          width: isMenu ? blurDimensions.height : "100vw",
        }}
      />
      <div
        className={cn(
          "absolute transition-all ease-in-out -rotate-90 translate-x-0 -translate-y-1/2 top-1/2 left-1/2 -z-10 will-change-transform",
          isMenu
            ? "duration-700 backdrop-blur-sm"
            : "duration-300 backdrop-blur-xl"
        )}
        style={{
          mask: isMenu ? "linear-gradient(black, black, transparent)" : "none",
          width: blurDimensions.width,
          height: "100vw",
          // @ts-expect-error tailwind variable
          "--tw-translate-x": blurTwTranslateX,
        }}
      />
    </div>
  );
};
