import { createContext, FC, ReactNode, useContext, useMemo } from "react";

import { useNextId } from "../hooks/utils/useNextId";

export type EntityIdContextValue = {
  getNextTowerId: (reset?: boolean) => number;
  ensureTowerIdAtLeast: (minId: number) => void;
  getNextEnemyId: (reset?: boolean) => number;
  ensureEnemyIdAtLeast: (minId: number) => void;
  getNextProjectileId: (reset?: boolean) => number;
  ensureProjectileIdAtLeast: (minId: number) => void;
};

const EntityIdContext = createContext<EntityIdContextValue | null>(null);

type EntityIdProviderProps = {
  children: ReactNode;
};

export const EntityIdProvider: FC<EntityIdProviderProps> = ({ children }) => {
  const {
    getNextId: getNextTowerId,
    ensureAtLeast: ensureTowerIdAtLeast,
  } = useNextId();
  const { getNextId: getNextEnemyId, ensureAtLeast: ensureEnemyIdAtLeast } =
    useNextId();
  const {
    getNextId: getNextProjectileId,
    ensureAtLeast: ensureProjectileIdAtLeast,
  } = useNextId();

  const value = useMemo(
    (): EntityIdContextValue => ({
      getNextTowerId,
      ensureTowerIdAtLeast,
      getNextEnemyId,
      ensureEnemyIdAtLeast,
      getNextProjectileId,
      ensureProjectileIdAtLeast,
    }),
    [
      getNextTowerId,
      ensureTowerIdAtLeast,
      getNextEnemyId,
      ensureEnemyIdAtLeast,
      getNextProjectileId,
      ensureProjectileIdAtLeast,
    ]
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
