import { trait } from "koota";

/** Generic damage request, raisable on any entity with HealthInfo; consumed by the ApplyDamageSystem. */
export const damageRequest = trait({ amount: 0 });
