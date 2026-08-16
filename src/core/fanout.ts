export interface FanoutFulfilled<T, R> {
  index: number;
  item: T;
  value: R;
}

export interface FanoutFailed<T> {
  index: number;
  item: T;
  error: unknown;
}

export interface FanoutResult<T, R> {
  fulfilled: FanoutFulfilled<T, R>[];
  failed: FanoutFailed<T>[];
}

export async function fanout<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<FanoutResult<T, R>> {
  const fulfilled: FanoutFulfilled<T, R>[] = [];
  const failed: FanoutFailed<T>[] = [];
  let next = 0;

  const lanes = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      const item = items[index] as T;
      try {
        const value = await worker(item, index);
        fulfilled.push({ index, item, value });
      } catch (error) {
        failed.push({ index, item, error });
      }
    }
  });

  await Promise.all(lanes);
  fulfilled.sort((a, b) => a.index - b.index);
  failed.sort((a, b) => a.index - b.index);
  return { fulfilled, failed };
}
