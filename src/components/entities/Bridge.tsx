import {
  FC,
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";

import {
  BoxGeometry,
  BufferGeometry,
  type Group,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import {
  sampleBasinFloorY,
  type BridgeTile,
  type CanyonWorldBBox,
} from "../../utils/canyonBridges";
import {
  flatFieldToSphereTileMeshCenter,
  getPlanetRadius,
  getQuaternionForPathStrip,
} from "../../utils/planetSurfaceMapping";
import { freezeSubtree } from "../../utils/freezeSubtree";
import { getCssColorValue } from "../ui/lib/cssUtils";

type BridgeProps = {
  tiles: BridgeTile[];
  /** Deck height above the planet surface (the path `yBase` over the canyon). */
  deckHeight: number;
  /** Extra clearance from the deck to its top face (the path `pathYOffset`). */
  pathYOffset: number;
  pathWidth: number;
  tileSize: number;
  gridSize: number;
  /** Draw the decking planks too. The game scene lets the path strip act as
      the deck, so it omits this; the editor (flat path) draws its own. */
  renderDeck?: boolean;
  /** The canyon's world bbox, so the anchor piers drop to the basin floor
      instead of the surface. Absent (flat terrain, e.g. the editor) piers
      drop to the surface. */
  canyonBBox?: CanyonWorldBBox | null;
};

// The raised walkway the user chose: a timber deck with a top rail on each
// side (posts connecting rail to deck) and stone anchor piers at the two ends
// of the span, dropping from the deck to the canyon floor.
const RAIL_HEIGHT = 0.22;
const PIER_SIZE = 0.14;
const UNIT = new Vector3(1, 1, 1);

export const Bridge: FC<BridgeProps> = memo(
  ({
    tiles,
    deckHeight,
    pathYOffset,
    pathWidth,
    tileSize,
    gridSize,
    renderDeck = false,
    canyonBBox = null,
  }) => {
    const radius = useMemo(
      () => getPlanetRadius(gridSize, tileSize),
      [gridSize, tileSize]
    );

    const deckTop = deckHeight + pathYOffset;
    const half = tileSize / 2;
    const railOffset = pathWidth / 2 + 0.03;

    const materials = useMemo(
      () => ({
        deck: new MeshStandardMaterial({
          color: getCssColorValue("scene-bridge-deck"),
          roughness: 0.85,
          metalness: 0.05,
        }),
        rail: new MeshStandardMaterial({
          color: getCssColorValue("scene-bridge-rail"),
          roughness: 0.8,
          metalness: 0.08,
        }),
        pier: new MeshStandardMaterial({
          color: getCssColorValue("scene-bridge-pier"),
          roughness: 0.9,
          metalness: 0.05,
        }),
      }),
      []
    );

    const merged = useMemo(() => {
      const deck: BufferGeometry[] = [];
      const rail: BufferGeometry[] = [];
      const post: BufferGeometry[] = [];
      const pier: BufferGeometry[] = [];

      const bake = (
        size: [number, number, number],
        local: Vector3,
        quaternion: Quaternion,
        surface: Vector3
      ): BufferGeometry =>
        new BoxGeometry(size[0], size[1], size[2]).applyMatrix4(
          new Matrix4().compose(
            // Transform the local (surface-aligned) offset into world space,
            // then add it to the surface point — the surface itself is already
            // in world coordinates and must not be rotated.
            surface.clone().add(local.applyQuaternion(quaternion)),
            quaternion,
            UNIT
          )
        );

      for (const tile of tiles) {
        const surface = flatFieldToSphereTileMeshCenter(
          tile.worldX,
          tile.worldZ,
          radius,
          0
        );
        const quaternion = getQuaternionForPathStrip(
          tile.worldX,
          tile.worldZ,
          tile.dirX,
          tile.dirZ,
          radius
        );

        if (renderDeck) {
          deck.push(bake([tileSize, 0.08, pathWidth + 0.08], new Vector3(0, deckTop - 0.04, 0), quaternion, surface));
        }

        // Top rail on each side.
        rail.push(
          bake([tileSize, 0.05, 0.05], new Vector3(0, deckTop + RAIL_HEIGHT, railOffset), quaternion, surface),
          bake([tileSize, 0.05, 0.05], new Vector3(0, deckTop + RAIL_HEIGHT, -railOffset), quaternion, surface)
        );

        // Support posts connecting the deck to the top rail, on each side.
        for (const px of [-half * 0.5, half * 0.5]) {
          for (const side of [railOffset, -railOffset]) {
            post.push(
              bake([0.04, RAIL_HEIGHT, 0.04], new Vector3(px, deckTop + RAIL_HEIGHT / 2, side), quaternion, surface)
            );
          }
        }

        // Anchor piers at the two ends of the span, dropping to the basin
        // floor (or the surface on flat terrain).
        if (tile.isRunStart || tile.isRunEnd) {
          const px = tile.isRunStart ? -half * 0.85 : half * 0.85;
          const pierLocal = new Vector3(px, 0, 0).applyQuaternion(quaternion);
          const pierWorldX = surface.x + pierLocal.x;
          const pierWorldZ = surface.z + pierLocal.z;
          const floorY = canyonBBox
            ? sampleBasinFloorY(pierWorldX, pierWorldZ, canyonBBox, radius)
            : surface.y;
          const pierHeight = Math.max(deckTop - floorY, 0.2);
          const pierCenterY = (deckTop + floorY) / 2;
          pier.push(
            bake([PIER_SIZE, pierHeight, PIER_SIZE], new Vector3(px, pierCenterY, 0), quaternion, surface)
          );
        }
      }

      const merge = (list: BufferGeometry[]): BufferGeometry | null => {
        if (list.length === 0) return null;
        const g = mergeGeometries(list);
        list.forEach((x) => x.dispose());
        return g;
      };
      return {
        deck: merge(deck),
        rail: merge(rail),
        post: merge(post),
        pier: merge(pier),
      };
    }, [tiles, radius, tileSize, pathWidth, deckTop, half, railOffset, renderDeck, canyonBBox]);

    useEffect(() => {
      return () => {
        Object.values(merged).forEach((g) => g?.dispose());
      };
    }, [merged]);

    // Stable for the component's lifetime: dispose only on unmount, not when
    // the geometry is rebuilt.
    useEffect(() => {
      return () => {
        Object.values(materials).forEach((m) => m.dispose());
      };
    }, [materials]);

    const rootRef = useRef<Group>(null);
    useLayoutEffect(() => {
      if (rootRef.current) freezeSubtree(rootRef.current);
    }, [merged]);

    if (tiles.length === 0) return null;

    return (
      <group ref={rootRef}>
        {merged.deck && (
          <mesh geometry={merged.deck} material={materials.deck} castShadow receiveShadow />
        )}
        {merged.rail && (
          <mesh geometry={merged.rail} material={materials.rail} castShadow />
        )}
        {merged.post && (
          <mesh geometry={merged.post} material={materials.rail} castShadow />
        )}
        {merged.pier && (
          <mesh geometry={merged.pier} material={materials.pier} castShadow receiveShadow />
        )}
      </group>
    );
  }
);

Bridge.displayName = "Bridge";
