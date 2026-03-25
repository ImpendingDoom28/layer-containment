export const pickRandomDistinct = <T>(
  items: readonly T[],
  count: number
): T[] => {
  const pool = [...items];
  const result: T[] = [];
  const n = Math.min(count, pool.length);
  for (let i = 0; i < n; i++) {
    const j = Math.floor(Math.random() * pool.length);
    result.push(pool[j]!);
    pool.splice(j, 1);
  }
  return result;
};
