import {
  FC,
  memo,
  ReactElement,
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { Instances, Instance } from "@react-three/drei";

import {
  createPoolController,
  InstancedPoolRef,
  InstanceSlot,
} from "../../utils/InstancedPool";

type InstanceSlotsProps = {
  count: number;
  slotRefs: RefObject<(InstanceSlot | null)[]>;
};

const InstanceSlots: FC<InstanceSlotsProps> = memo(({ count, slotRefs }) => (
  <>
    {Array.from({ length: count }, (_, i) => (
      <Instance
        key={i}
        ref={(el: unknown) => {
          slotRefs.current[i] = el as InstanceSlot | null;
        }}
      />
    ))}
  </>
));

InstanceSlots.displayName = "InstanceSlots";

export type UseInstancedEntityConfig = {
  limit: number;
  defaultColor: string;
  instancesContent: ReactNode;
  frustumCulled?: boolean;
  /**
   * Whether the pooled `InstancedMesh` writes to the shadow map. drei
   * spreads this onto the underlying `<instancedMesh>`, so the whole pool
   * casts (or does not) in the shadow pass with a single draw call.
   */
  castShadow?: boolean;
};

export type UseInstancedEntityReturn = {
  pool: InstancedPoolRef | null;
  slotRefs: RefObject<(InstanceSlot | null)[]>;
  InstancedEntity: ReactElement;
};

export const useInstancedEntity = (
  config: UseInstancedEntityConfig
): UseInstancedEntityReturn => {
  const {
    limit,
    defaultColor,
    instancesContent,
    frustumCulled = false,
    castShadow = false,
  } = config;

  const slotRefs = useRef<(InstanceSlot | null)[]>([]);
  const poolRef = useRef<InstancedPoolRef | null>(null);
  const isInitializedRef = useRef(false);

  const initialize = useCallback(() => {
    if (!isInitializedRef.current) {
      poolRef.current = createPoolController(slotRefs, limit);
      isInitializedRef.current = true;
    }

    for (let i = 0; i < limit; i++) {
      const slot = slotRefs.current[i];
      if (slot) {
        slot.position.set(0, -10000, 0);
        slot.scale.set(0, 0, 0);
        slot.color.set(defaultColor);
      }
    }
  }, [defaultColor, limit]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  useEffect(() => {
    return () => {
      poolRef.current = null;
      isInitializedRef.current = false;
    };
  }, []);

  const InstancedEntity = useMemo(
    () => (
      <Instances
        limit={limit}
        frustumCulled={frustumCulled}
        castShadow={castShadow}
      >
        {instancesContent}
        <InstanceSlots count={limit} slotRefs={slotRefs} />
      </Instances>
    ),
    [limit, frustumCulled, castShadow, instancesContent]
  );

  return {
    pool: poolRef.current,
    slotRefs,
    InstancedEntity,
  };
};
