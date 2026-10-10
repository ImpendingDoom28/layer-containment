// The Health component is defined once in core and shared by the whole app
// (base entity, enemies, and this demo page). Re-exported here so the
// tower-defence-ecs demo keeps its original import path.
export { HealthInfo, isDead } from "../../core/ecs/traits/health";
