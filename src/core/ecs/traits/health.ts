import { trait } from "koota";

export const HealthInfo = trait({
  currentHealth: 0,
  maxHealth: 100,
});

export const isDead = trait();
