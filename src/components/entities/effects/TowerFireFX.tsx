import { FC, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
} from "three";

import type { Tower as TowerInstance } from "../../../core/types/game";
import { gameEvents } from "../../../utils/eventEmitter";
import { GameEvent } from "../../../core/types/enums/events";
import { useSimulationClock } from "../../../core/contexts/SimulationClockContext";
import { useReducedMotion } from "../../../core/hooks/useReducedMotion";

// The muzzle flash is a sub-0.1 s spike: bright on the shot's frame, gone
// within a few frames, so a fast-firing tower reads as a machine gun's
// strobing flash instead of a steady glow.
const FLASH_DURATION = 0.07;
const FLASH_OPACITY = 0.9;
const FLASH_SIZE = 0.22;

// The recoil punch: only the barrel (the turret's barrel node) kicks back
// toward its base along the muzzle axis and shrinks on the shot, then springs
// back over RECOIL_DURATION on an ease-out curve (fast recovery, soft settle,
// exactly at rest when done). The rest of the turret stays put, so the tower
// does not lurch as a whole. The pullback is a fraction of the barrel length
// (the muzzle distance) so short and long barrels both read as the same kick,
// and the shrink bottoms out at RECOIL_MIN_SCALE × the rest scale.
const RECOIL_DURATION = 0.18;
const RECOIL_PULLBACK_FRACTION = 0.15;
const RECOIL_MIN_SCALE = 0.95;

// One radial-gradient texture shared by every tower's flash sprite (a canvas
// glow: white core fading to transparent). Lazily created so importing this
// module in a DOM-less (node) test environment never touches `document`.
let flashTexture: CanvasTexture | null = null;
const getFlashTexture = (): CanvasTexture | null => {
  if (flashTexture) return flashTexture;
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.25, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.6, "rgba(255,255,255,0.35)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  flashTexture = new CanvasTexture(canvas);
  return flashTexture;
};

type TowerFireFXProps = {
  tower: TowerInstance;
  /** The tower's accent colour (tints the flash). */
  color: string;
  /** The model's rotating turret node (registered once the model loads). */
  turretNodeRef: { current: Object3D | null };
  /** The barrel node inside the turret that the recoil punch animates. */
  barrelNodeRef: { current: Object3D | null };
  /** Scene tower height (sizes the fallback flash position when no node). */
  towerHeight: number;
};

/**
 * Per-tower firing feedback, driven by the `TOWER_FIRE` game event: a brief
 * additive muzzle-flash sprite at the barrel tip and a one-shot recoil punch
 * (the barrel kicks back toward its base along the muzzle axis and shrinks,
 * then springs back; the rest of the turret stays put).
 *
 * Everything animates in `useFrame` by mutation (no per-shot React state):
 * the event only flips a flag the frame loop consumes, so a shot costs one
 * flag write and a few property writes per frame while the effects decay.
 * Time is the pause-aware simulation clock, so effects freeze with the world
 * on pause. Both effects are skipped under `prefers-reduced-motion`.
 */
export const TowerFireFX: FC<TowerFireFXProps> = ({
  tower,
  color,
  turretNodeRef,
  barrelNodeRef,
  towerHeight,
}) => {
  const { getSimulationTime } = useSimulationClock();
  const reducedMotion = useReducedMotion();

  // The shot's flag: set by the event listener, consumed on the next frame.
  // A flag (rather than recording the event's time) keeps the effect on the
  // simulation clock and correct across the frame-callback ordering.
  const pendingFireRef = useRef(false);
  const lastFireSimTimeRef = useRef(-Infinity);
  // The muzzle point the most recent shot left, in the turret node's local
  // frame. For multi-tube towers (the BRL) the fire event carries the specific
  // tube the shot left, so the flash lands on that tube; for single-muzzle
  // towers it equals the rest muzzle. Null until the first shot (or a shot
  // that fell back to the centre emitter).
  const lastFiredMuzzleRef = useRef<{
    x: number;
    y: number;
    z: number;
  } | null>(null);

  // This FX's own scene group: the flash sprite's fallback anchor while the
  // model is still loading (no turret node to parent to yet).
  const fxGroupRef = useRef<Object3D>(null);
  // The barrel's rest transform (position + scale), captured the first frame
  // the barrel exists so the recoil springs back to exactly the model's rest
  // pose (a fitted model's barrel may carry a non-identity rest transform).
  const barrelRestRef = useRef<{
    position: Vector3;
    scale: number;
  } | null>(null);
  // The per-tower recoil offset (a unit axis from the barrel tip toward its
  // base plus a length in the barrel's rest scale), derived from the muzzle
  // point and the barrel's rest position on the first shot.
  const recoilVecRef = useRef<{ axis: Vector3; length: number } | null>(null);

  // Per-tower muzzle-flash sprite: the radial texture is shared, the material
  // is per-tower (each tower's flash decays on its own shot).
  const spriteMaterial = useMemo(() => {
    const tint = new Color("#ffffff").lerp(new Color(color), 0.3);
    return new SpriteMaterial({
      map: getFlashTexture(),
      color: tint,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
  }, [color]);
  const flashSprite = useMemo(() => {
    const sprite = new Sprite(spriteMaterial);
    sprite.visible = false;
    sprite.scale.setScalar(FLASH_SIZE);
    return sprite;
  }, [spriteMaterial]);
  useEffect(
    () => () => {
      if (flashSprite.parent) flashSprite.parent.remove(flashSprite);
      spriteMaterial.dispose();
    },
    [flashSprite, spriteMaterial]
  );

  // Listen for this tower's shots. The listener only flips a flag (the event
  // fires from the simulation's frame loop; consuming it in the next
  // `useFrame` keeps the effect on the simulation clock).
  useEffect(() => {
    const towerId = tower.id;
    const onFire = (data: {
      towerId?: number;
      muzzleLocal?: { x: number; y: number; z: number } | null;
    }) => {
      if (data && data.towerId === towerId) {
        pendingFireRef.current = true;
        lastFiredMuzzleRef.current = data.muzzleLocal ?? null;
      }
    };
    gameEvents.on(GameEvent.TOWER_FIRE, onFire);
    return () => {
      gameEvents.off(GameEvent.TOWER_FIRE, onFire);
    };
  }, [tower.id]);

  useFrame((state) => {
    const simTime = getSimulationTime(state.clock.elapsedTime);
    if (pendingFireRef.current) {
      pendingFireRef.current = false;
      lastFireSimTimeRef.current = simTime;
    }
    const ft = simTime - lastFireSimTimeRef.current;

    const node = turretNodeRef.current;
    const barrel = barrelNodeRef.current;
    const sprite = flashSprite;

    // Keep the flash sprite at the muzzle that fired: parented to the turret
    // node, which carries the aim rotation (the muzzle point is in the turret
    // node's local frame — the same source of truth as the projectile spawn,
    // which transforms it by the turret's live world matrix). For multi-tube
    // towers the event carries the specific tube the shot left, so the flash
    // moves with the round-robin tube. While the model is still loading (no
    // node) or before the first shot (no muzzle yet), it falls back to the
    // centre emitter (the same height the projectile falls back to).
    const firedMuzzle = lastFiredMuzzleRef.current ?? tower.muzzle?.muzzle;
    if (node && firedMuzzle) {
      if (sprite.parent !== node) {
        if (sprite.parent) sprite.parent.remove(sprite);
        node.add(sprite);
      }
      if (
        sprite.position.x !== firedMuzzle.x ||
        sprite.position.y !== firedMuzzle.y ||
        sprite.position.z !== firedMuzzle.z
      ) {
        sprite.position.set(firedMuzzle.x, firedMuzzle.y, firedMuzzle.z);
      }
    } else if (sprite.parent !== fxGroupRef.current) {
      // Also runs while the sprite is still unparented (a shot fired before
      // the model loaded, or after a load failure): it must be attached to
      // the fallback anchor, not skipped.
      if (sprite.parent) sprite.parent.remove(sprite);
      if (fxGroupRef.current) {
        fxGroupRef.current.add(sprite);
        sprite.position.set(
          0,
          tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7,
          0
        );
      }
    }

    // Recoil punch on the barrel only: it kicks back toward its base along
    // the muzzle axis and shrinks on the shot, then springs back on an
    // ease-out cubic (fast recovery, soft settle, exactly at rest when done).
    // The rest of the turret is untouched.
    const recoilActive =
      !reducedMotion && barrel !== null && ft < RECOIL_DURATION;
    if (recoilActive) {
      if (barrelRestRef.current === null) {
        const muzzle = tower.muzzle?.muzzle;
        const rest = {
          position: barrel.position.clone(),
          scale: barrel.scale.x,
        };
        barrelRestRef.current = rest;
        if (muzzle) {
          // Recoil pulls the barrel tip back toward its own pivot (base), not
          // the turret origin: the muzzle point is in the turret node's frame
          // (same as the barrel's rest position), so the tip → base direction
          // is `rest.position − muzzle`.
          const toTip = new Vector3(
            muzzle.x - rest.position.x,
            muzzle.y - rest.position.y,
            muzzle.z - rest.position.z
          );
          const length = toTip.length() * RECOIL_PULLBACK_FRACTION * rest.scale;
          const axis =
            toTip.length() > 0
              ? toTip.clone().multiplyScalar(-1).normalize()
              : new Vector3();
          recoilVecRef.current = { axis, length };
        }
      }
      const rest = barrelRestRef.current;
      const recoil = recoilVecRef.current;
      const p = ft / RECOIL_DURATION;
      const ease = 1 - (1 - p) ** 3;
      if (recoil) {
        // axis points from the tip toward the base, so adding the offset
        // pulls the tip back; (1 − ease) is 1 on the shot and → 0 as it
        // springs to rest.
        const kick = recoil.length * (1 - ease);
        barrel.position.set(
          rest.position.x + recoil.axis.x * kick,
          rest.position.y + recoil.axis.y * kick,
          rest.position.z + recoil.axis.z * kick
        );
      }
      barrel.scale.setScalar(
        rest.scale * (RECOIL_MIN_SCALE + (1 - RECOIL_MIN_SCALE) * ease)
      );
    } else if (barrel && barrelRestRef.current) {
      const rest = barrelRestRef.current;
      if (
        barrel.position.x !== rest.position.x ||
        barrel.position.y !== rest.position.y ||
        barrel.position.z !== rest.position.z
      ) {
        barrel.position.copy(rest.position);
      }
      if (barrel.scale.x !== rest.scale) {
        barrel.scale.setScalar(rest.scale);
      }
    }

    // Muzzle flash: bright on the shot's frame, gone within a few frames.
    const flashActive = !reducedMotion && ft < FLASH_DURATION;
    if (flashActive) {
      const p = ft / FLASH_DURATION;
      sprite.visible = true;
      spriteMaterial.opacity = FLASH_OPACITY * (1 - p);
      sprite.scale.setScalar(FLASH_SIZE * (0.7 + 0.3 * (1 - p)));
    } else if (sprite.visible) {
      sprite.visible = false;
    }
  });

  return <group ref={fxGroupRef} />;
};

TowerFireFX.displayName = "TowerFireFX";
