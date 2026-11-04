import {
  FC,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  Sprite,
  SpriteMaterial,
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

// The recoil punch: the turret node (barrel) dips and scales down on the
// shot, then springs back to rest over RECOIL_DURATION on an ease-out curve
// (fast recovery, soft settle). The scale bottom is the 0.95× of the spec.
const RECOIL_DURATION = 0.18;
const RECOIL_DIP = 0.1;
const RECOIL_MIN_SCALE = 0.95;

// The body pulse: the whole tower glows its own colour for a few frames on
// each shot — the "responsive" beat players register. The quadratic falloff
// makes the spike read fast instead of a lingering wash.
const PULSE_DURATION = 0.15;
const PULSE_OPACITY = 0.55;

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
  /** The tower's accent colour (tints the body pulse and the flash). */
  color: string;
  /** The group holding the tower body (model or fallback) the pulse clones. */
  bodyContainerRef: { current: Group | null };
  /** The model's rotating turret node (registered once the model loads). */
  turretNodeRef: { current: Object3D | null };
  /** Scene tower height (sizes the fallback flash position when no node). */
  towerHeight: number;
};

/**
 * Per-tower firing feedback, driven by the `TOWER_FIRE` game event: a brief
 * additive muzzle-flash sprite at the barrel tip, a one-shot recoil punch
 * (the turret dips and scales to 0.95×, then springs back), and a fast
 * emissive pulse over the whole body (a hidden clone of the body re-pointed
 * at a per-tower additive material, so towers of the same type — which share
 * their GLTF materials — never pulse in unison).
 *
 * Everything animates in `useFrame` by mutation (no per-shot React state):
 * the event only flips a flag the frame loop consumes, so a shot costs one
 * flag write and a few property writes per frame while the effects decay.
 * Time is the pause-aware simulation clock, so effects freeze with the world
 * on pause. The flash and the recoil are skipped under `prefers-reduced-motion`
 * (the body pulse is a glow, not motion, and stays).
 */
export const TowerFireFX: FC<TowerFireFXProps> = ({
  tower,
  color,
  bodyContainerRef,
  turretNodeRef,
  towerHeight,
}) => {
  const { getSimulationTime } = useSimulationClock();
  const reducedMotion = useReducedMotion();

  // The shot's flag: set by the event listener, consumed on the next frame.
  // A flag (rather than recording the event's time) keeps the effect on the
  // simulation clock and correct across the frame-callback ordering.
  const pendingFireRef = useRef(false);
  const lastFireSimTimeRef = useRef(-Infinity);

  // Per-tower body-pulse material (additive glow over the cloned body).
  const pulseMaterial = useMemo(() => {
    const pulseColor = new Color(color).lerp(new Color("#ffffff"), 0.3);
    return new MeshBasicMaterial({
      color: pulseColor,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    });
  }, [color]);
  useEffect(() => () => pulseMaterial.dispose(), [pulseMaterial]);

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

  // The pulse marker: a hidden clone of the body's rendered subtree re-pointed
  // at the pulse material, rebuilt only when the body's node changes (the
  // Suspense fallback resolving to the model — detected by the first child's
  // uuid, exactly like the enemy HitFlash). The clone references the body's
  // shared geometry, so the primitive mounts with `dispose={null}`.
  const [pulseMarker, setPulseMarker] = useState<Object3D | null>(null);
  const bodyKeyRef = useRef("");
  const rebuildPulseMarker = () => {
    const container = bodyContainerRef.current;
    if (!container || container.children.length === 0) return;
    const key = container.children[0].uuid;
    if (key === bodyKeyRef.current) return;
    bodyKeyRef.current = key;
    const clone = container.clone(true);
    clone.traverse((object) => {
      if ((object as Partial<Mesh>).isMesh) {
        (object as Mesh).material = pulseMaterial;
      }
    });
    clone.visible = false;
    setPulseMarker(clone);
  };
  // Runs after each commit so the marker can be built from the current body
  // node (including the first mount).
  useLayoutEffect(() => {
    rebuildPulseMarker();
  });

  // Listen for this tower's shots. The listener only flips a flag (the event
  // fires from the simulation's frame loop; consuming it in the next
  // `useFrame` keeps the effect on the simulation clock).
  useEffect(() => {
    const towerId = tower.id;
    const onFire = (data: { towerId?: number }) => {
      if (data && data.towerId === towerId) pendingFireRef.current = true;
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
    const container = bodyContainerRef.current;
    const sprite = flashSprite;

    // Keep the flash sprite at the barrel tip: parented to the turret node so
    // it inherits the aim rotation (the muzzle point is the node's local
    // barrel tip, the same source of truth as the projectile spawn). While
    // the model is still loading there is no node, so it falls back to the
    // centre emitter (the same height the projectile falls back to).
    const muzzle = tower.muzzle?.muzzle;
    if (node && muzzle) {
      if (sprite.parent !== node) {
        if (sprite.parent) sprite.parent.remove(sprite);
        node.add(sprite);
        sprite.position.set(muzzle.x, muzzle.y, muzzle.z);
      }
    } else if (sprite.parent) {
      sprite.parent.remove(sprite);
      if (container) {
        container.add(sprite);
        sprite.position.set(
          0,
          tower.type === "laser" ? towerHeight * 0.5 : towerHeight * 0.7,
          0
        );
      }
    }

    // Recoil punch: dip + 0.95× scale on the shot, springing back on an
    // ease-out cubic (fast recovery, soft settle, exactly at rest when done).
    const recoilActive =
      !reducedMotion && node !== null && ft < RECOIL_DURATION;
    if (recoilActive) {
      const p = ft / RECOIL_DURATION;
      const ease = 1 - (1 - p) ** 3;
      node.rotation.x = RECOIL_DIP * (1 - ease);
      node.scale.setScalar(RECOIL_MIN_SCALE + (1 - RECOIL_MIN_SCALE) * ease);
    } else if (node) {
      if (node.rotation.x !== 0) node.rotation.x = 0;
      if (node.scale.x !== 1) node.scale.setScalar(1);
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

    // Body pulse: the glow shell reads the pulse material's opacity, which is
    // shared with the clone, so one write drives the whole body.
    const marker = pulseMarker;
    if (marker) {
      if (ft < PULSE_DURATION) {
        const k = 1 - ft / PULSE_DURATION;
        marker.visible = true;
        pulseMaterial.opacity = PULSE_OPACITY * k * k;
      } else if (marker.visible) {
        marker.visible = false;
        pulseMaterial.opacity = 0;
      }
    }

    // The body can swap nodes without a re-render (a Suspense fallback
    // resolving to its model), so re-check every frame and rebuild the clone
    // only when it actually changed.
    if (container && container.children.length > 0) {
      const key = container.children[0].uuid;
      if (key !== bodyKeyRef.current) rebuildPulseMarker();
    }
  });

  return (
    <>{pulseMarker && <primitive object={pulseMarker} dispose={null} />}</>
  );
};

TowerFireFX.displayName = "TowerFireFX";
