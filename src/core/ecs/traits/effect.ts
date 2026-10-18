import { trait, type TraitRecord } from "koota";

/** Tags a transient visual effect entity (spawn/end ring burst). */
export const IsEffect = trait();

/**
 * Cold data for a transient effect. Written once on spawn and never mutated,
 * so a `useTrait` subscription is safe. The view layer animates and then
 * destroys the entity; no system runs per-frame against this trait.
 */
export type EffectData = {
  position: [number, number, number];
  color: string;
  type: "spawn" | "end";
  duration: number;
};

const createDefaultEffect = (): EffectData => ({
  position: [0, 0, 0],
  color: "",
  type: "spawn",
  duration: 0.5,
});

export const Effect = trait(createDefaultEffect);

export type EffectDataRecord = TraitRecord<typeof Effect>;
