import { createContext, FC, ReactNode, useContext, useMemo } from "react";

import { useNextId } from "../hooks/utils/useNextId";

export type EntityIdContextValue = {
  getNextTowerId: (reset?: boolean) => number;
  getNextEnemyId: (reset?: boolean) => number;
  ensureEnemyIdAtLeast: (minId: number) => void;
  getNextProjectileId: (reset?: boolean) => number;
};

const EntityIdContext = createContext<EntityIdContextValue | null>(null);

type EntityIdProviderProps = {
  children: ReactNode;
};

export const EntityIdProvider: FC<EntityIdProviderProps> = ({ children }) => {
  const { getNextId: getNextTowerId } = useNextId();
  const { getNextId: getNextEnemyId, ensureAtLeast: ensureEnemyIdAtLeast } =
    useNextId();
  const { getNextId: getNextProjectileId } = useNextId();

  const value = useMemo(
    (): EntityIdContextValue => ({
      getNextTowerId,
      getNextEnemyId,
      ensureEnemyIdAtLeast,
      getNextProjectileId,
    }),
    [getNextTowerId, getNextEnemyId, ensureEnemyIdAtLeast, getNextProjectileId]
  );

  return (
    <EntityIdContext.Provider value={value}>
      {children}
    </EntityIdContext.Provider>
  );
};

export const useEntityIds = (): EntityIdContextValue => {
  const ctx = useContext(EntityIdContext);
  if (!ctx) {
    throw new Error("useEntityIds must be used within EntityIdProvider");
  }
  return ctx;
};
