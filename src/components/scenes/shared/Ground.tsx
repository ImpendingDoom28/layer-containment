import { FC, memo } from "react";

import {
  gridSizeSelector,
  useLevelStore,
} from "../../../core/stores/useLevelStore";
import {
  tileSizeSelector,
  useGameStore,
} from "../../../core/stores/useGameStore";
import { getCssColorValue } from "../../ui/lib/cssUtils";

export const Ground: FC = memo(() => {
  const gridSize = useLevelStore(gridSizeSelector);
  const tileSize = useGameStore(tileSizeSelector);
  const groundSize = gridSize * tileSize;

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]} receiveShadow>
      <planeGeometry args={[groundSize, groundSize]} />
      <meshStandardMaterial color={getCssColorValue("scene-gray-600")} />
    </mesh>
  );
});

Ground.displayName = "Ground";
