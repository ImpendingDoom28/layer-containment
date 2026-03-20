/**
 * Drei Instance Slot Pool
 *
 * A pool that manages acquire/release of Instance slots from
 * @react-three/drei's <Instances>/<Instance> components.
 *
 * Operates on PositionMesh transforms (position, quaternion, scale, color)
 * and drei handles syncing to the GPU each frame.
 */

import * as THREE from "three";

export type InstanceSlot = THREE.Group & { color: THREE.Color };

export type InstancedPoolStats = {
  available: number;
  inUse: number;
  maxInstances: number;
};

export type InstancedPoolRef = {
  acquire: () => number;
  release: (index: number) => void;
  releaseAll: () => void;
  setPosition: (index: number, x: number, y: number, z: number) => void;
  setTransform: (
    index: number,
    position: THREE.Vector3,
    quaternion?: THREE.Quaternion,
    scale?: THREE.Vector3
  ) => void;
  setScale: (index: number, x: number, y: number, z: number) => void;
  setColor: (index: number, color: THREE.Color | string | number) => void;
  getPosition: (index: number) => THREE.Vector3;
  isInUse: (index: number) => boolean;
  getInUseIndices: () => ReadonlySet<number>;
  getStats: () => InstancedPoolStats;
};

const hiddenPosition = new THREE.Vector3(0, -10000, 0);

export const createPoolController = (
  slotRefs: React.MutableRefObject<(InstanceSlot | null)[]>,
  maxInstances: number
): InstancedPoolRef => {
  const availableIndices: number[] = [];
  const inUseIndices = new Set<number>();
  const syncSlotMatrix = (slot: InstanceSlot) => {
    slot.updateMatrix();
    slot.updateMatrixWorld();
  };

  const hideSlot = (index: number) => {
    const slot = slotRefs.current[index];
    if (!slot) return;

    slot.position.copy(hiddenPosition);
    slot.scale.set(0, 0, 0);
    slot.quaternion.identity();
    syncSlotMatrix(slot);
  };

  for (let i = maxInstances - 1; i >= 0; i--) {
    availableIndices.push(i);
  }

  return {
    acquire: () => {
      if (availableIndices.length === 0) {
        console.warn("InstancedPool: Pool exhausted");
        return -1;
      }

      const index = availableIndices.pop()!;
      inUseIndices.add(index);
      return index;
    },

    release: (index: number) => {
      if (!inUseIndices.has(index)) {
        console.warn("InstancedPool: Invalid index:", index);
        return;
      }

      inUseIndices.delete(index);
      availableIndices.push(index);
      hideSlot(index);
    },

    releaseAll: () => {
      inUseIndices.forEach((index) => {
        availableIndices.push(index);
        hideSlot(index);
      });
      inUseIndices.clear();
    },

    setPosition: (index: number, x: number, y: number, z: number) => {
      const slot = slotRefs.current[index];
      if (!slot || !inUseIndices.has(index)) return;

      slot.position.set(x, y, z);
      syncSlotMatrix(slot);
    },

    setTransform: (
      index: number,
      position: THREE.Vector3,
      quaternion?: THREE.Quaternion,
      scale?: THREE.Vector3
    ) => {
      const slot = slotRefs.current[index];
      if (!slot || !inUseIndices.has(index)) return;

      slot.position.copy(position);
      if (quaternion) slot.quaternion.copy(quaternion);
      if (scale) slot.scale.copy(scale);
      syncSlotMatrix(slot);
    },

    setScale: (index: number, x: number, y: number, z: number) => {
      const slot = slotRefs.current[index];
      if (!slot || !inUseIndices.has(index)) return;

      slot.scale.set(x, y, z);
      syncSlotMatrix(slot);
    },

    setColor: (index: number, color: THREE.Color | string | number) => {
      const slot = slotRefs.current[index];
      if (!slot || !inUseIndices.has(index)) return;

      if (color instanceof THREE.Color) {
        slot.color.copy(color);
      } else {
        slot.color.set(color as THREE.ColorRepresentation);
      }
    },

    getPosition: (index: number) => {
      const slot = slotRefs.current[index];
      if (!slot) return new THREE.Vector3();

      return slot.position.clone();
    },

    isInUse: (index: number) => inUseIndices.has(index),

    getInUseIndices: () => inUseIndices,

    getStats: () => ({
      available: availableIndices.length,
      inUse: inUseIndices.size,
      maxInstances,
    }),
  };
};
