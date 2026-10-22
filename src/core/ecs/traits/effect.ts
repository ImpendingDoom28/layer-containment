import { trait, type TraitRecord } from "koota";

/** Tags a transient visual effect entity (spawn/end ring burst). */
export const IsEffect = trait();

/**
 * Cold data for a transient effect. Written once on spawn and never mutated,
 * so a `useTrait` subscription is safe. The position lives on the generic
 * `Position` trait; this trait only carries the visual parameters. The view
 * layer (`EffectSystem`) animates and then destroys the entity.
 */
export type EffectData = {
  color: string;
  type: "spawn" | "end";
  duration: number;
};

export const Effect = trait<EffectData>({
  color: "",
  type: "spawn",
  duration: 0.5,
});

export type EffectDataRecord = TraitRecord<typeof Effect>;

/**
 * Request to spawn a transient effect, carried by a short-lived request
 * entity (mirrors `damageRequest`). `x`/`y`/`z` is the burst position in
 * world space, `color` the ring color, `type` the burst kind, `duration`
 * optional (the apply system falls back to the per-type default when it is 0).
 *
 * The request entity is destroyed once the apply system has spawned the
 * effect entity.
 */
export type SpawnEffectRequestData = {
  x: number;
  y: number;
  z: number;
  color: string;
  type: "spawn" | "end";
  duration: number;
};

export const spawnEffectRequest = trait<SpawnEffectRequestData>({
  x: 0,
  y: 0,
  z: 0,
  color: "",
  type: "spawn",
  duration: 0,
});

export type SpawnEffectRequestRecord = TraitRecord<typeof spawnEffectRequest>;
