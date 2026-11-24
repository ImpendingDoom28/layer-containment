import { FC, memo, PropsWithChildren } from "react";
import { Canvas } from "@react-three/fiber";

import {
  GAME_CANVAS_DPR,
  GAME_CANVAS_GL,
  GAME_CANVAS_STYLE,
} from "../../../constants/canvas";

type AppCanvasProps = PropsWithChildren<{
  testId: string;
}>;

export const AppCanvas: FC<AppCanvasProps> = memo(({ testId, children }) => {
  return (
    <Canvas
      data-testid={testId}
      style={GAME_CANVAS_STYLE}
      gl={GAME_CANVAS_GL}
      dpr={GAME_CANVAS_DPR}
    >
      {children}
    </Canvas>
  );
});

AppCanvas.displayName = "AppCanvas";
