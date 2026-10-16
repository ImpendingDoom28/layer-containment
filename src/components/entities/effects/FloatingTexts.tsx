import {
  forwardRef,
  memo,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Sprite, SpriteMaterial, Texture } from "three";

import { useSimulationClock } from "../../../core/hooks/useSimulationClock";

/**
 * Camera-facing text sprites that rise and fade in world space (damage numbers,
 * gold rewards). Managed imperatively via a fixed pool so high-frequency combat
 * events never trigger React re-renders; `useFrame` advances and recycles slots.
 * The pool is built in an effect and a ready flag forces one re-render so the
 * sprite nodes commit into the scene graph.
 */

const POOL_SIZE = 40;
const CANVAS_WIDTH = 256;
const CANVAS_HEIGHT = 64;
const RISE_PER_SECOND = 0.7;
const DURATION_SECONDS = 0.8;
const SPRITE_HEIGHT = 0.34;
const SPRITE_ASPECT = CANVAS_WIDTH / CANVAS_HEIGHT;

type Slot = {
  sprite: Sprite;
  ctx: CanvasRenderingContext2D | null;
  texture: Texture;
  material: SpriteMaterial;
  active: boolean;
  age: number;
  baseX: number;
  baseY: number;
  baseZ: number;
};

export type FloatingTextsHandle = {
  spawn: (text: string, position: [number, number, number], color: string) => void;
};

type FloatingTextsProps = {
  shouldStopMovement: boolean;
};

const drawText = (
  ctx: CanvasRenderingContext2D | null,
  text: string,
  color: string
): void => {
  if (!ctx) return;
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.font = "bold 42px 'Segoe UI', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.fillText(text, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 1);
};

const createSlot = (): Slot => {
  // DOM is not guaranteed (test renderers, SSR): fall back to an empty
  // texture so the slot still animates, just without a drawn label.
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  if (typeof document !== "undefined") {
    canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    ctx = canvas.getContext("2d");
  }
  const texture = canvas ? new CanvasTexture(canvas) : new Texture();
  const material = new SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const sprite = new Sprite(material);
  sprite.visible = false;
  sprite.raycast = () => null;
  return {
    sprite,
    ctx,
    texture,
    material,
    active: false,
    age: 0,
    baseX: 0,
    baseY: 0,
    baseZ: 0,
  };
};

export const FloatingTexts = memo(
  forwardRef<FloatingTextsHandle, FloatingTextsProps>(
    ({ shouldStopMovement }, ref) => {
      const [, getTimeScale] = useSimulationClock(shouldStopMovement);
      const slotsRef = useRef<Slot[]>([]);
      const [isReady, setIsReady] = useState(false);

      useEffect(() => {
        const slots: Slot[] = [];
        for (let i = 0; i < POOL_SIZE; i++) {
          slots.push(createSlot());
        }
        slotsRef.current = slots;
        setIsReady(true);
        return () => {
          for (const slot of slots) {
            slot.material.dispose();
            slot.texture.dispose();
          }
          slotsRef.current = [];
        };
      }, []);

      useImperativeHandle(ref, () => ({
        spawn(text, position, color) {
          const slots = slotsRef.current;
          let slot = slots.find((s) => !s.active);
          if (!slot && slots.length > 0) {
            slot = slots.reduce((oldest, s) => (s.age > oldest.age ? s : oldest));
          }
          if (!slot) return;

          drawText(slot.ctx, text, color);
          slot.texture.needsUpdate = true;
          slot.age = 0;
          slot.baseX = position[0];
          slot.baseY = position[1];
          slot.baseZ = position[2];
          slot.active = true;
          slot.sprite.visible = true;
          slot.sprite.position.set(position[0], position[1], position[2]);
          slot.sprite.scale.set(SPRITE_HEIGHT * SPRITE_ASPECT, SPRITE_HEIGHT, 1);
          slot.material.opacity = 1;
        },
      }));

      useFrame((_, delta) => {
        const scale = getTimeScale();
        for (const slot of slotsRef.current) {
          if (!slot.active) continue;
          slot.age += delta * scale;
          const progress = Math.min(slot.age / DURATION_SECONDS, 1);
          if (progress >= 1) {
            slot.active = false;
            slot.sprite.visible = false;
            slot.material.opacity = 0;
            continue;
          }
          slot.sprite.position.set(
            slot.baseX,
            slot.baseY + progress * RISE_PER_SECOND * DURATION_SECONDS,
            slot.baseZ
          );
          const fade = progress < 0.25 ? 1 : 1 - (progress - 0.25) / 0.75;
          slot.material.opacity = fade;
        }
      });

      if (!isReady) return null;

      return (
        <group>
          {slotsRef.current.map((slot, index) => (
            <primitive key={index} object={slot.sprite} />
          ))}
        </group>
      );
    }
  )
);

FloatingTexts.displayName = "FloatingTexts";
